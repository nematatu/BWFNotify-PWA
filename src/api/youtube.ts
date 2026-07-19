import { japanesePlayerRomanizedNames } from "../config/japanese-player-names";
import {
	type YoutubeStreamSource,
	youtubeStreamSourcesFor,
} from "../config/youtube-stream-sources";
import type { MatchSummary } from "../type";

const YOUTUBE_HOSTS = new Set([
	"youtube.com",
	"www.youtube.com",
	"m.youtube.com",
	"youtu.be",
]);
const PAGE_CACHE_TTL_SECONDS = 15 * 60;
const LIVE_CACHE_TTL_SECONDS = 4 * 60;
const METADATA_CACHE_TTL_SECONDS = 5 * 60;
const MAX_YOUTUBE_PAGE_BYTES = 1_500_000;
const MAX_METADATA_BYTES = 64_000;
const MAX_SEARCH_VIDEO_IDS = 8;

type YoutubeFetcher = (
	input: RequestInfo | URL,
	init?: RequestInit,
) => Promise<Response>;

type YoutubeMetadata = {
	title?: unknown;
	author_name?: unknown;
	author_url?: unknown;
};

type YoutubeMatch = {
	tournament: string;
	players: string[];
	court?: string;
	startTime?: string;
};

export function resolveYoutubeMatchUrl(
	_match: YoutubeMatch,
	directUrl?: string,
): string {
	return validYoutubeUrl(directUrl) || "";
}

export function validYoutubeUrl(value: string | undefined): string | null {
	if (!value || value.length > 2048) {
		return null;
	}
	try {
		const url = new URL(value);
		if (url.protocol !== "https:" || !YOUTUBE_HOSTS.has(url.hostname)) {
			return null;
		}
		const videoId =
			url.hostname === "youtu.be"
				? url.pathname.slice(1)
				: url.pathname === "/watch"
					? url.searchParams.get("v")
					: null;
		return videoId && /^[\w-]{11}$/.test(videoId) ? url.toString() : null;
	} catch {
		return null;
	}
}

export async function resolveYoutubeStreamUrls(
	matches: MatchSummary[],
	fetcher: YoutubeFetcher = fetch,
): Promise<MatchSummary[]> {
	const metadataRequests = new Map<string, Promise<YoutubeMetadata | null>>();
	const candidateRequests = new Map<string, Promise<string[]>>();

	const resolved = await Promise.all(
		matches.map(async (match) => {
			const knownUrl = validYoutubeUrl(match.youtubeUrl);
			if (knownUrl) {
				return { ...match, youtubeUrl: knownUrl };
			}
			const sources = youtubeStreamSourcesFor(
				match.tournament,
				match.tournamentCategory,
			);
			if (sources.length === 0) {
				return { ...match, youtubeUrl: "" };
			}

			for (const source of sources) {
				const cachedUrl = await cachedResolution(match, source);
				if (cachedUrl !== null) {
					if (cachedUrl) {
						return { ...match, youtubeUrl: cachedUrl };
					}
					continue;
				}
				const videoIds = await sourceCandidates(
					match,
					source,
					fetcher,
					candidateRequests,
				);
				for (const videoId of videoIds) {
					const metadata = await cachedMetadata(
						videoId,
						fetcher,
						metadataRequests,
					);
					if (
						metadata &&
						metadataFromSource(metadata, source) &&
						titleMatchesMatch(String(metadata.title || ""), match)
					) {
						const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
						await cacheResolution(match, source, youtubeUrl);
						return {
							...match,
							youtubeUrl,
						};
					}
				}
				await cacheResolution(match, source, "");
			}
			return { ...match, youtubeUrl: "" };
		}),
	);
	return resolved;
}

async function cachedResolution(
	match: MatchSummary,
	source: YoutubeStreamSource,
): Promise<string | null> {
	if (typeof caches === "undefined") {
		return null;
	}
	try {
		const response = await (caches as any).default.match(
			resolutionCacheRequest(match, source),
		);
		if (!response) {
			return null;
		}
		const value = (await response.json()) as { url?: unknown };
		return typeof value.url === "string" ? value.url : null;
	} catch {
		return null;
	}
}

async function cacheResolution(
	match: MatchSummary,
	source: YoutubeStreamSource,
	url: string,
): Promise<void> {
	if (typeof caches === "undefined") {
		return;
	}
	const ttl =
		match.eventType === "live"
			? LIVE_CACHE_TTL_SECONDS
			: PAGE_CACHE_TTL_SECONDS;
	try {
		await (caches as any).default.put(
			resolutionCacheRequest(match, source),
			Response.json(
				{ url },
				{ headers: { "Cache-Control": `public, max-age=${ttl}` } },
			),
		);
	} catch {
		// Discovery still succeeds when the edge cache is unavailable.
	}
}

function resolutionCacheRequest(
	match: MatchSummary,
	source: YoutubeStreamSource,
): Request {
	const url = new URL("https://youtube-resolution.bwfnotify.internal/match");
	url.searchParams.set("id", match.id);
	url.searchParams.set("event", match.eventType);
	url.searchParams.set("source", source.handle);
	url.searchParams.set("date", match.tournamentDate || "");
	url.searchParams.set("court", String(courtNumber(match.court) ?? ""));
	return new Request(url);
}

async function sourceCandidates(
	match: MatchSummary,
	source: YoutubeStreamSource,
	fetcher: YoutubeFetcher,
	cache: Map<string, Promise<string[]>>,
): Promise<string[]> {
	const key = [
		source.handle,
		match.eventType,
		match.tournament,
		match.tournamentDate,
		courtNumber(match.court),
	].join("|");
	let request = cache.get(key);
	if (!request) {
		request = loadSourceCandidates(match, source, fetcher);
		cache.set(key, request);
	}
	return request;
}

async function loadSourceCandidates(
	match: MatchSummary,
	source: YoutubeStreamSource,
	fetcher: YoutubeFetcher,
): Promise<string[]> {
	const ids: string[] = [];
	if (match.eventType === "live") {
		ids.push(
			...(await videoIdsFromPage(
				`https://www.youtube.com/${source.handle}/live`,
				LIVE_CACHE_TTL_SECONDS,
				fetcher,
			)),
		);
	}

	const query = [
		source.handle,
		match.tournament,
		formattedStreamDate(match.tournamentDate),
		courtSearchTerm(match.court),
		match.round,
	]
		.filter(Boolean)
		.join(" ");
	const search = new URL("https://www.youtube.com/results");
	search.searchParams.set("search_query", query);
	ids.push(
		...(await videoIdsFromPage(
			search.toString(),
			PAGE_CACHE_TTL_SECONDS,
			fetcher,
		)),
	);
	return [...new Set(ids)].slice(0, MAX_SEARCH_VIDEO_IDS);
}

async function videoIdsFromPage(
	url: string,
	cacheTtl: number,
	fetcher: YoutubeFetcher,
): Promise<string[]> {
	try {
		const response = await fetcher(url, {
			headers: { "accept-language": "en", "user-agent": "Mozilla/5.0" },
			cf: { cacheEverything: true, cacheTtl },
		});
		if (!response.ok) {
			return [];
		}
		const contentLength = Number(response.headers.get("content-length") || 0);
		if (contentLength > MAX_YOUTUBE_PAGE_BYTES) {
			return [];
		}
		const html = await limitedResponseText(response, MAX_YOUTUBE_PAGE_BYTES);
		if (html == null) {
			return [];
		}
		return [
			...new Set(
				[...html.matchAll(/"videoId":"([\w-]{11})"/g)].map((match) => match[1]),
			),
		].slice(0, MAX_SEARCH_VIDEO_IDS);
	} catch {
		return [];
	}
}

async function cachedMetadata(
	videoId: string,
	fetcher: YoutubeFetcher,
	cache: Map<string, Promise<YoutubeMetadata | null>>,
): Promise<YoutubeMetadata | null> {
	let request = cache.get(videoId);
	if (!request) {
		request = loadMetadata(videoId, fetcher);
		cache.set(videoId, request);
	}
	return request;
}

async function loadMetadata(
	videoId: string,
	fetcher: YoutubeFetcher,
): Promise<YoutubeMetadata | null> {
	try {
		const url = `https://www.youtube.com/watch?v=${videoId}`;
		const response = await fetcher(
			`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
			{
				cf: {
					cacheEverything: true,
					cacheTtl: METADATA_CACHE_TTL_SECONDS,
				},
			},
		);
		if (!response.ok) {
			return null;
		}
		const text = await limitedResponseText(response, MAX_METADATA_BYTES);
		return text == null ? null : (JSON.parse(text) as YoutubeMetadata);
	} catch {
		return null;
	}
}

function metadataFromSource(
	metadata: YoutubeMetadata,
	source: YoutubeStreamSource,
): boolean {
	if (
		typeof metadata.title !== "string" ||
		typeof metadata.author_url !== "string"
	) {
		return false;
	}
	try {
		return new URL(metadata.author_url).pathname === source.authorPath;
	} catch {
		return false;
	}
}

function titleMatchesMatch(title: string, match: MatchSummary): boolean {
	const normalizedTitle = normalizeSearchText(title);
	if (!tournamentMatches(normalizedTitle, match.tournament)) {
		return false;
	}
	if (teamsMatch(normalizedTitle, match)) {
		return true;
	}
	return (
		Boolean(match.tournamentDate) &&
		dateMatches(normalizedTitle, String(match.tournamentDate)) &&
		courtMatches(normalizedTitle, match.court)
	);
}

function tournamentMatches(title: string, tournament: string): boolean {
	const tokens = searchTokens(tournament).filter(
		(token) =>
			!["BWF", "HSBC", "WORLD", "TOUR", "OPEN"].includes(token) &&
			!/^20\d{2}$/.test(token),
	);
	const required = Math.min(2, tokens.length);
	return (
		required > 0 &&
		tokens.filter((token) => title.includes(token)).length >= required
	);
}

function teamsMatch(title: string, match: MatchSummary): boolean {
	const teams = match.teams.slice(0, 2);
	return (
		teams.length === 2 &&
		teams.every(
			(team) =>
				team.players.length > 0 &&
				team.players.some((player) =>
					[player.name, ...japanesePlayerRomanizedNames(player.name)].some(
						(name) => playerNameMatches(title, name),
					),
				),
		)
	);
}

function playerNameMatches(title: string, name: string): boolean {
	const tokens = searchTokens(name);
	if (tokens.some((token) => token.length >= 4 && title.includes(token))) {
		return true;
	}
	const compact = tokens.join("");
	return compact.length >= 5 && title.replaceAll(" ", "").includes(compact);
}

function dateMatches(title: string, value: string): boolean {
	const match = value.match(/^\d{4}-(\d{2})-(\d{2})$/);
	if (!match) {
		return false;
	}
	const month = Number(match[1]);
	const day = Number(match[2]);
	const monthName = [
		"JANUARY",
		"FEBRUARY",
		"MARCH",
		"APRIL",
		"MAY",
		"JUNE",
		"JULY",
		"AUGUST",
		"SEPTEMBER",
		"OCTOBER",
		"NOVEMBER",
		"DECEMBER",
	][month - 1];
	return (
		title.includes(`${day} ${monthName}`) ||
		title.includes(`${monthName} ${day}`) ||
		title.includes(`${month} ${day}`)
	);
}

function courtMatches(title: string, court?: string): boolean {
	const number = courtNumber(court);
	return (
		number != null && new RegExp(`(?:^| )COURT ${number}(?: |$)`).test(title)
	);
}

function courtNumber(court?: string): number | null {
	const value = court?.match(/\d+/)?.[0];
	return value ? Number(value) : null;
}

function courtSearchTerm(court?: string): string {
	const number = courtNumber(court);
	return number == null ? "" : `Court ${number}`;
}

function formattedStreamDate(value?: string): string {
	const match = value?.match(/^\d{4}-(\d{2})-(\d{2})$/);
	return match ? `${Number(match[2])} ${monthName(Number(match[1]))}` : "";
}

function monthName(month: number): string {
	return (
		[
			"January",
			"February",
			"March",
			"April",
			"May",
			"June",
			"July",
			"August",
			"September",
			"October",
			"November",
			"December",
		][month - 1] || ""
	);
}

function searchTokens(value: string): string[] {
	return normalizeSearchText(value).split(" ").filter(Boolean);
}

function normalizeSearchText(value: string): string {
	return value
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, " ")
		.trim();
}

async function limitedResponseText(
	response: Response,
	maxBytes: number,
): Promise<string | null> {
	if (!response.body) {
		return "";
	}
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let size = 0;
	let text = "";
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				return text + decoder.decode();
			}
			size += value.byteLength;
			if (size > maxBytes) {
				await reader.cancel();
				return null;
			}
			text += decoder.decode(value, { stream: true });
		}
	} finally {
		reader.releaseLock();
	}
}
