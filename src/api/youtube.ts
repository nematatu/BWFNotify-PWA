import {
	type YoutubeStreamSource,
	youtubeStreamSourcesFor,
} from "../config/youtube-stream-sources";
import type { MatchSummary } from "../type";
import {
	courtNumber,
	courtSearchTerm,
	formattedStreamDate,
	metadataMatchesSource,
	titleMatchesMatch,
	validYoutubeUrl,
	type YoutubeMetadata,
} from "./youtubeMatch";

export { validYoutubeUrl } from "./youtubeMatch";

// Worker cache interface for Cloudflare caches.default usage
interface WorkerCache {
	match(req: Request): Promise<Response | undefined>;
	put(req: Request, res: Response): Promise<void>;
}

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
						metadataMatchesSource(metadata, source) &&
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
	interface WorkerCache {
		match(req: Request): Promise<Response | undefined>;
		put(req: Request, res: Response): Promise<void>;
	}
	try {
		const response = await (
			caches as unknown as { default: WorkerCache }
		).default.match(resolutionCacheRequest(match, source));
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
		await (caches as unknown as { default: WorkerCache }).default.put(
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
