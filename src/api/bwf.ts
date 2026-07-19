import type {
	BwfMatch,
	BwfPlayer,
	BwfTeam,
	HeadToHeadSummary,
	MatchSummary,
	PreviousMeeting,
} from "../type";
import {
	adjacentDates,
	array,
	object,
	optionalString,
	todayJst,
} from "../utils";
import { extractJapaneseMatches } from "./bwfMatch";
import { resolveYoutubeMatchUrl, resolveYoutubeStreamUrls } from "./youtube";

export { eventType, extractJapaneseMatches } from "./bwfMatch";

const BWF_LIVE_URL =
	"https://extranet-lv.bwfbadminton.com/api/match-center/vue-current-live";
const BWF_DAY_MATCHES_URL =
	"https://extranet-lv.bwfbadminton.com/api/tournaments/day-matches";
const BWF_H2H_URL = "https://extranet-lv.bwfbadminton.com/api/h2h/statistics";
const H2H_CACHE_PREFIX = "bwf:h2h:v3:";
const H2H_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;

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
	resolveYoutubeStreams?: boolean;
};

export async function fetchJapaneseMatches(
	cache?: KVNamespace,
	knownMatches: MatchSummary[] = [],
	options: FetchJapaneseMatchesOptions = {},
): Promise<MatchSummary[]> {
	const tournaments = tournamentsFrom(
		await fetchBwfJson(BWF_LIVE_URL, options.upstreamCacheTtlSeconds),
	);
	const dates = adjacentDates(todayJst());
	const matches: BwfMatch[] = [];
	let successfulDayRequests = 0;

	for (const tournament of tournaments) {
		for (const date of dates) {
			try {
				const payload = await fetchBwfJson(
					dayMatchesUrl(tournament.code, date),
					options.upstreamCacheTtlSeconds,
				);
				successfulDayRequests += 1;
				matches.push(
					...array(payload)
						.map((value) => parseMatch(value, tournament))
						.filter(isPresent),
				);
			} catch (error) {
				console.error(
					JSON.stringify({
						event: "bwf-day-matches-error",
						tournamentCode: tournament.code,
						date,
						error: error instanceof Error ? error.message : String(error),
					}),
				);
			}
		}
	}
	if (successfulDayRequests === 0) {
		throw new Error("BWF day matches are unavailable");
	}

	const knownById = new Map(knownMatches.map((match) => [match.id, match]));
	const extracted = extractJapaneseMatches(matches).map((match) => ({
		...match,
		youtubeUrl:
			resolveYoutubeMatchUrl(match, knownById.get(match.id)?.youtubeUrl) || "",
	}));
	const summaries =
		options.resolveYoutubeStreams === false
			? extracted
			: await resolveYoutubeStreamUrls(extracted);
	return cache
		? enrichWithHeadToHead(summaries, cache, knownMatches)
		: summaries;
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

async function enrichWithHeadToHead(
	matches: MatchSummary[],
	cache: KVNamespace,
	knownMatches: MatchSummary[],
): Promise<MatchSummary[]> {
	const knownHeadToHead = new Map(
		knownMatches
			.filter((match) => match.h2h)
			.map((match) => [match.id, match.h2h] as const),
	);
	return Promise.all(
		matches.map(async (match) => {
			if (!hasHeadToHeadPlayers(match)) {
				return match;
			}
			const known = knownHeadToHead.get(match.id);
			if (known) {
				return { ...match, h2h: known };
			}

			const key = `${H2H_CACHE_PREFIX}${match.id}`;
			const cached = await cache.get<HeadToHeadSummary>(key, "json");
			if (cached) {
				return { ...match, h2h: cached };
			}

			try {
				const h2h = parseHeadToHead(
					await fetchBwfJson(headToHeadUrl(match)),
					match.teams.map((team) =>
						team.players.map((player) => player.id).filter(isPresent),
					),
				);
				if (!h2h) {
					return match;
				}
				await cache.put(key, JSON.stringify(h2h), {
					expirationTtl: H2H_CACHE_TTL_SECONDS,
				});
				return { ...match, h2h };
			} catch (error) {
				console.error(
					JSON.stringify({
						event: "bwf-h2h-error",
						matchId: match.id,
						error: error instanceof Error ? error.message : String(error),
					}),
				);
				return match;
			}
		}),
	);
}

function hasHeadToHeadPlayers(match: MatchSummary): boolean {
	return (
		match.teams.length === 2 &&
		match.teams.every(
			(team) =>
				team.players.length > 0 &&
				team.players.length <= 2 &&
				team.players.every((player) => Boolean(player.id)),
		)
	);
}

function headToHeadUrl(match: MatchSummary): string {
	const url = new URL(BWF_H2H_URL);
	match.teams.forEach((team, teamIndex) => {
		team.players.forEach((player, playerIndex) => {
			url.searchParams.set(
				`t${teamIndex + 1}p${playerIndex + 1}`,
				player.id || "",
			);
		});
	});
	return url.toString();
}

export function parseHeadToHead(
	payload: unknown,
	currentTeamPlayerIds?: string[][],
): HeadToHeadSummary | null {
	const root = object(payload);
	const stats = object(root.stats);
	const team1 = object(stats.team1);
	const team2 = object(stats.team2);
	const team1Wins = optionalNumber(team1.totalWins);
	const team2Wins = optionalNumber(team2.totalWins);
	const totalMatches = optionalNumber(stats.totalMatches);
	if (team1Wins == null || team2Wins == null || totalMatches == null) {
		return null;
	}

	const previous = array(root.matches)
		.map((value) =>
			parsePreviousMeeting(
				value,
				shouldSwapPreviousTeams(value, currentTeamPlayerIds),
			),
		)
		.filter(isPresent)
		.sort((left, right) =>
			(right.date || "").localeCompare(left.date || ""),
		)[0];

	return { team1Wins, team2Wins, totalMatches, previous };
}

function parsePreviousMeeting(
	value: unknown,
	swapTeams: boolean,
): PreviousMeeting | null {
	const item = object(value);
	const info = object(item.info);
	const result = object(item.result);
	const progress = object(item.progress);
	const tournament = object(item.tournament);
	const startTime = object(item.matchStartTime);
	const games = array(progress.games)
		.map((value) => {
			const game = object(value);
			const team1 = optionalNumber(game.team1);
			const team2 = optionalNumber(game.team2);
			return team1 == null || team2 == null
				? null
				: swapTeams
					? { team1: team2, team2: team1 }
					: { team1, team2 };
		})
		.filter(isPresent);
	const tournamentName = optionalString(tournament.name);
	if (!tournamentName || games.length === 0) {
		return null;
	}

	const rawWinner = optionalNumber(result.winner);
	const winner =
		rawWinner === 1 || rawWinner === 2
			? swapTeams
				? rawWinner === 1
					? 2
					: 1
				: rawWinner
			: undefined;
	return {
		tournament: tournamentName,
		date:
			optionalString(startTime.dateLocal) ||
			optionalString(info.matchTime)?.match(/^\d{4}-\d{2}-\d{2}/)?.[0],
		round: optionalString(info.roundName),
		winner,
		games,
	};
}

function shouldSwapPreviousTeams(
	value: unknown,
	currentTeamPlayerIds: string[][] | undefined,
): boolean {
	if (currentTeamPlayerIds?.length !== 2) {
		return false;
	}

	const item = object(value);
	const previousTeam1 = previousPlayerIds(item.team1);
	const previousTeam2 = previousPlayerIds(item.team2);
	return (
		samePlayerIds(previousTeam1, currentTeamPlayerIds[1] || []) &&
		samePlayerIds(previousTeam2, currentTeamPlayerIds[0] || [])
	);
}

function previousPlayerIds(value: unknown): string[] {
	const team = object(value);
	return [team.player1, team.player2]
		.map((player) => object(player).id)
		.map((id) =>
			typeof id === "string" || typeof id === "number" ? String(id) : undefined,
		)
		.filter(isPresent);
}

function samePlayerIds(left: string[], right: string[]): boolean {
	const sortedLeft = [...left].sort();
	const sortedRight = [...right].sort();
	return (
		sortedLeft.length > 0 &&
		sortedLeft.length === sortedRight.length &&
		sortedLeft.every((id, index) => id === sortedRight[index])
	);
}

function optionalNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
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

function isPresent<T>(value: T | null | undefined): value is T {
	return value != null;
}
