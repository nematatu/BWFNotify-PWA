import matchCenterTournaments from "../../config/match-center-tournaments.json";
import type { BwfMatch, BwfPlayer, BwfTeam, MatchSummary } from "../type";
import {
	adjacentDates,
	array,
	errorMessage,
	isPresent,
	object,
	optionalNumber,
	optionalString,
	todayJst,
} from "../utils";
import { enrichWithHeadToHead } from "./bwfH2h";
import { extractJapaneseMatches } from "./bwfMatch";

export { parseHeadToHead } from "./bwfH2h";
export { eventType, extractJapaneseMatches } from "./bwfMatch";

const BWF_LIVE_URL =
	"https://extranet-lv.bwfbadminton.com/api/match-center/vue-current-live";
const BWF_DAY_MATCHES_URL =
	"https://extranet-lv.bwfbadminton.com/api/tournaments/day-matches";

const BWF_FETCH_HEADERS: HeadersInit[] = [
	{
		accept: "application/json,text/plain,*/*",
		"accept-language": "en-US,en;q=0.9",
		referer: "https://bwfbadminton.com/",
		"user-agent":
			"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
	},
	{ accept: "application/json,text/plain,*/*" },
];

type Tournament = {
	code: string;
	name?: string;
	logoUrl?: string;
	headerImageUrl?: string;
	headerImageMobileUrl?: string;
	category?: string;
	link?: string;
};

type FetchJapaneseMatchesOptions = {
	upstreamCacheTtlSeconds?: number;
	enrichHeadToHead?: boolean;
	dates?: string[];
};

export async function fetchJapaneseMatches(
	cache?: KVNamespace,
	knownMatches: MatchSummary[] = [],
	options: FetchJapaneseMatchesOptions = {},
): Promise<MatchSummary[]> {
	const dates = options.dates || adjacentDates(todayJst());
	const tournaments = tournamentsForDates(
		await fetchBwfJson(BWF_LIVE_URL, options.upstreamCacheTtlSeconds),
		dates,
	);
	// 開催中の大会がない週は、取得する試合がないだけで失敗ではない。
	// 例外にするとCronが状態を保存できず、前の大会の「ライブ」「このあと」が残り続ける。
	if (tournaments.length === 0) return [];
	let lastDayError = "";
	// 大会×日付の取得は互いに依存しないため同時に行い、待ち時間を1回分にする。
	// 結果は大会・日付の順に並べ直し、直列取得していたときと同じ順序を保つ。
	const dayResults = await Promise.all(
		tournaments.flatMap((tournament) =>
			dates.map(async (date) => {
				try {
					const payload = await fetchBwfJson(
						dayMatchesUrl(tournament.code, date),
						options.upstreamCacheTtlSeconds,
					);
					return array(payload)
						.map((value) => parseMatch(value, tournament))
						.filter(isPresent);
				} catch (error) {
					lastDayError = errorMessage(error);
					console.error(
						JSON.stringify({
							event: "bwf-day-matches-error",
							tournamentCode: tournament.code,
							date,
							error: errorMessage(error),
						}),
					);
					return null;
				}
			}),
		),
	);
	if (!dayResults.some((result) => result !== null)) {
		// どの取得で何が起きたかを、呼び出し元の記録や応答から確かめられるようにする
		throw new Error(`BWF day matches are unavailable (${lastDayError})`);
	}
	const matches: BwfMatch[] = dayResults.flatMap((result) => result || []);

	const extracted = extractJapaneseMatches(matches);
	const completed = extracted.filter(
		(match) => match.eventType === "completed",
	);
	const current = extracted.filter((match) => match.eventType !== "completed");
	const enriched =
		cache && options.enrichHeadToHead !== false
			? await enrichWithHeadToHead(current, cache, knownMatches, fetchBwfJson)
			: current;
	return [...enriched, ...completed];
}

export function tournamentsForDates(
	payload: unknown,
	dates: string[],
): Tournament[] {
	const byCode = new Map(
		tournamentsFrom(payload).map((tournament) => [tournament.code, tournament]),
	);
	const sortedDates = [...dates].sort();
	const firstDate = sortedDates[0];
	const lastDate = sortedDates.at(-1);
	if (!firstDate || !lastDate) return [...byCode.values()];

	for (const value of matchCenterTournaments.tournaments) {
		const tournament = object(value);
		const code = optionalString(tournament.code);
		const startDate = optionalString(tournament.startDate);
		const endDate = optionalString(tournament.endDate);
		if (
			code &&
			startDate &&
			endDate &&
			startDate <= lastDate &&
			endDate >= firstDate &&
			!byCode.has(code)
		) {
			byCode.set(code, {
				code,
				name: optionalString(tournament.name),
			});
		}
	}
	return [...byCode.values()];
}

function tournamentsFrom(payload: unknown): Tournament[] {
	return array(object(payload).results)
		.map((value) => object(value))
		.map((item) => ({
			code: optionalString(item.code) || "",
			name: optionalString(item.name),
			logoUrl: optionalString(item.tmtLogo),
			headerImageUrl: optionalString(item.tmtHeaderImage),
			headerImageMobileUrl: optionalString(item.tmtHeaderImageMobile),
			category: optionalString(object(item.category_model).name),
			link: optionalString(item.tmtLink),
		}))
		.filter((item) => /^[0-9A-F-]{36}$/i.test(item.code));
}

function parseMatch(value: unknown, tournament: Tournament): BwfMatch | null {
	const item = object(value);
	const rawId = item.id;
	if (typeof rawId !== "string" && typeof rawId !== "number") {
		return null;
	}

	return {
		id: String(rawId),
		tournamentCode: tournament.code,
		tournamentName: optionalString(item.tournamentName) || tournament.name,
		tournamentLogoUrl: tournament.logoUrl,
		tournamentHeaderImageUrl: tournament.headerImageUrl,
		tournamentHeaderImageMobileUrl: tournament.headerImageMobileUrl,
		tournamentCategory: tournament.category,
		matchStatus: optionalString(item.matchStatus),
		matchStatusValue: optionalString(item.matchStatusValue),
		scoreStatus:
			typeof item.scoreStatus === "number" ? item.scoreStatus : undefined,
		scoreStatusValue: optionalString(item.scoreStatusValue),
		matchTime: optionalString(item.matchTime),
		matchTimeUtc: optionalString(item.matchTimeUtc),
		roundName: optionalString(item.roundName),
		courtName: optionalString(item.courtName),
		matchTypeValue: optionalString(item.matchTypeValue),
		team1: parseTeam(item.team1),
		team2: parseTeam(item.team2),
		score: array(item.score).map(parseGameScore).filter(isPresent),
	};
}

function parseGameScore(value: unknown) {
	const item = object(value);
	const set = optionalNumber(item.set);
	const home = optionalNumber(item.home);
	const away = optionalNumber(item.away);
	if (set == null || home == null || away == null) {
		return null;
	}
	const lastPointWinner = optionalTeamNumber(item.lastPointWinner);
	const serve = optionalTeamNumber(item.serve);
	return { set, home, away, lastPointWinner, serve };
}

function parseTeam(value: unknown): BwfTeam | undefined {
	const item = object(value);
	if (Object.keys(item).length === 0) {
		return undefined;
	}

	return {
		countryCode: optionalString(item.countryCode)?.toUpperCase(),
		countryFlagUrl: optionalString(item.countryFlagUrl),
		players: array(item.players).map(parsePlayer).filter(isPresent),
	};
}

function parsePlayer(value: unknown): BwfPlayer | null {
	const item = object(value);
	const avatar = object(item.avatar);
	const rawId = item.id;
	const nameDisplay = optionalString(item.nameDisplay);
	const countryCode = optionalString(item.countryCode)?.toUpperCase();
	return nameDisplay || countryCode
		? {
				id:
					typeof rawId === "string" || typeof rawId === "number"
						? String(rawId)
						: undefined,
				nameDisplay,
				countryCode,
				countryFlagUrl: optionalString(item.countryFlagUrl),
				photoUrl:
					optionalString(avatar.thumbnailUrl) ||
					optionalString(avatar.url_cloudinary),
			}
		: null;
}

function optionalTeamNumber(value: unknown): 1 | 2 | undefined {
	return value === 1 || value === 2 ? value : undefined;
}

async function fetchBwfJson(
	url: string,
	cacheTtlSeconds?: number,
): Promise<unknown> {
	let lastStatus = 0;
	for (const headers of BWF_FETCH_HEADERS) {
		const response = await fetch(url, {
			headers,
			...(cacheTtlSeconds
				? {
						cf: {
							cacheEverything: true,
							cacheTtl: cacheTtlSeconds,
						},
					}
				: {}),
		});
		if (response.ok) {
			return response.json();
		}
		lastStatus = response.status;
	}
	throw new Error(`BWF request failed with status ${lastStatus}`);
}

function dayMatchesUrl(tournamentCode: string, date: string): string {
	const url = new URL(BWF_DAY_MATCHES_URL);
	url.searchParams.set("tournamentCode", tournamentCode);
	url.searchParams.set("date", date);
	url.searchParams.set("order", "2");
	url.searchParams.set("court", "0");
	return url.toString();
}
