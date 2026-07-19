import { japanesePlayerRomanizedNames } from "../config/japanese-player-names";
import type { YoutubeStreamSource } from "../config/youtube-stream-sources";
import type { MatchSummary } from "../type";

const YOUTUBE_HOSTS = new Set([
	"youtube.com",
	"www.youtube.com",
	"m.youtube.com",
	"youtu.be",
]);

export type YoutubeMetadata = {
	title?: unknown;
	author_name?: unknown;
	author_url?: unknown;
};

export function validYoutubeUrl(value: string | undefined): string | null {
	if (!value || value.length > 2048) return null;
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

export function metadataMatchesSource(
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

export function titleMatchesMatch(title: string, match: MatchSummary): boolean {
	const normalizedTitle = normalizeSearchText(title);
	if (!tournamentMatches(normalizedTitle, match.tournament)) return false;
	if (match.eventType === "live" && teamsMatch(normalizedTitle, match)) {
		return true;
	}
	return (
		Boolean(match.tournamentDate) &&
		dateMatches(normalizedTitle, String(match.tournamentDate)) &&
		courtMatches(normalizedTitle, match.court)
	);
}

export function courtNumber(court?: string): number | null {
	const value = court?.match(/\d+/)?.[0];
	return value ? Number(value) : null;
}

export function courtSearchTerm(court?: string): string {
	const number = courtNumber(court);
	return number == null ? "" : `Court ${number}`;
}

export function formattedStreamDate(value?: string): string {
	const match = value?.match(/^\d{4}-(\d{2})-(\d{2})$/);
	return match ? `${Number(match[2])} ${monthName(Number(match[1]))}` : "";
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
	if (!match) return false;
	const month = Number(match[1]);
	const day = Number(match[2]);
	const name = monthName(month).toUpperCase();
	return (
		title.includes(`${day} ${name}`) ||
		title.includes(`${name} ${day}`) ||
		title.includes(`${month} ${day}`)
	);
}

function courtMatches(title: string, court?: string): boolean {
	const number = courtNumber(court);
	return (
		number != null && new RegExp(`(?:^| )COURT ${number}(?: |$)`).test(title)
	);
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
