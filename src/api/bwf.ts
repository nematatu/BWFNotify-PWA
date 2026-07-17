import { japanesePlayerName } from "../config/japanese-player-names";
import type {
	BwfMatch,
	BwfPlayer,
	BwfTeam,
	EventType,
	HeadToHeadSummary,
	MatchPlayerSummary,
	MatchSummary,
	MatchTeamSummary,
	PreviousMeeting,
} from "../type";
import {
	adjacentDates,
	array,
	object,
	optionalString,
	todayJst,
} from "../utils";

const BWF_LIVE_URL =
	"https://extranet-lv.bwfbadminton.com/api/match-center/vue-current-live";
const BWF_DAY_MATCHES_URL =
	"https://extranet-lv.bwfbadminton.com/api/tournaments/day-matches";
const BWF_H2H_URL = "https://extranet-lv.bwfbadminton.com/api/h2h/statistics";
const TARGET_COUNTRY = "JPN";
const H2H_CACHE_PREFIX = "bwf:h2h:v3:";
const SCHEDULED_H2H_TTL_SECONDS = 6 * 60 * 60;
const LIVE_H2H_TTL_SECONDS = 5 * 60;

type Tournament = {
	code: string;
	name?: string;
	logoUrl?: string;
	link?: string;
};

export async function fetchJapaneseMatches(
	cache?: KVNamespace,
): Promise<MatchSummary[]> {
	const tournaments = tournamentsFrom(await fetchBwfJson(BWF_LIVE_URL));
	const dates = adjacentDates(todayJst());
	const matches: BwfMatch[] = [];

	for (const tournament of tournaments) {
		for (const date of dates) {
			const payload = await fetchBwfJson(dayMatchesUrl(tournament.code, date));
			matches.push(
				...array(payload)
					.map((value) => parseMatch(value, tournament))
					.filter(isPresent),
			);
		}
	}

	const summaries = extractJapaneseMatches(matches);
	return cache ? enrichWithHeadToHead(summaries, cache) : summaries;
}

export function extractJapaneseMatches(matches: BwfMatch[]): MatchSummary[] {
	const seen = new Set<string>();
	const result: MatchSummary[] = [];

	for (const match of matches) {
		const type = eventType(match);
		if (
			(type !== "live" && type !== "scheduled") ||
			!includesCountry(match, TARGET_COUNTRY) ||
			seen.has(match.id)
		) {
			continue;
		}

		seen.add(match.id);
		const teams = [match.team1, match.team2]
			.map(toTeamSummary)
			.filter(isPresent)
			.sort(
				(left, right) =>
					Number(teamIsJapanese(right)) - Number(teamIsJapanese(left)),
			);
		result.push({
			id: match.id,
			tournament: match.tournamentName || "BWF",
			tournamentLogoUrl: match.tournamentLogoUrl,
			matchUrl: matchPageUrl(match),
			players: teams.map(teamName).filter(Boolean),
			teams,
			eventType: type,
			status: type === "live" ? displayStatus(match) : "",
			round: match.roundName || match.matchTypeValue,
			court: match.courtName,
			startTime: match.matchTimeUtc || match.matchTime,
		});
	}

	return result.sort((left, right) => {
		if (left.eventType !== right.eventType) {
			return left.eventType === "live" ? -1 : 1;
		}
		return (left.startTime || "\uffff").localeCompare(
			right.startTime || "\uffff",
		);
	});
}

export function eventType(match: BwfMatch): EventType {
	const statuses = statusCandidates(match).map((status) =>
		status.toLowerCase(),
	);

	if (
		statuses.some((status) =>
			["p", "in progress", "live", "playing", "on court"].includes(status),
		)
	) {
		return "live";
	}
	if (
		statuses.some((status) => ["f", "finished", "completed"].includes(status))
	) {
		return "completed";
	}
	if (
		statuses.some((status) =>
			["n", "s", "not started", "scheduled", "none"].includes(status),
		)
	) {
		return "scheduled";
	}

	return "unknown";
}

function tournamentsFrom(payload: unknown): Tournament[] {
	return array(object(payload).results)
		.map((value) => object(value))
		.map((item) => ({
			code: optionalString(item.code) || "",
			name: optionalString(item.name),
			logoUrl: optionalString(item.tmtLogo),
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
		tournamentLink: tournament.link,
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
	};
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

function includesCountry(match: BwfMatch, country: string): boolean {
	return [match.team1, match.team2].some(
		(team) =>
			team?.countryCode === country ||
			team?.players.some((player) => player.countryCode === country),
	);
}

function toTeamSummary(team: BwfTeam | undefined): MatchTeamSummary | null {
	if (!team) {
		return null;
	}

	const players = team.players
		.map((player): MatchPlayerSummary | null => {
			if (!player.nameDisplay) {
				return null;
			}
			const isJapanese =
				player.countryCode === TARGET_COUNTRY ||
				team.countryCode === TARGET_COUNTRY;
			return {
				id: player.id,
				name: isJapanese
					? japanesePlayerName(player.nameDisplay) || player.nameDisplay
					: player.nameDisplay,
				countryCode: player.countryCode || team.countryCode,
				flagUrl: player.countryFlagUrl || team.countryFlagUrl,
				photoUrl: player.photoUrl,
				isJapanese,
			};
		})
		.filter(isPresent);

	return {
		countryCode: team.countryCode,
		flagUrl: team.countryFlagUrl || players[0]?.flagUrl,
		players,
	};
}

function teamName(team: MatchTeamSummary): string {
	return team.players.map((player) => player.name).join(" / ");
}

function teamIsJapanese(team: MatchTeamSummary): boolean {
	return (
		team.countryCode === TARGET_COUNTRY ||
		team.players.some((player) => player.isJapanese)
	);
}

function matchPageUrl(match: BwfMatch): string | undefined {
	if (!match.tournamentLink) {
		return undefined;
	}

	try {
		const link = new URL(match.tournamentLink);
		const localDate = match.matchTime?.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
		if (
			localDate &&
			link.hostname.endsWith("bwfbadminton.com") &&
			link.pathname.replace(/\/$/, "").endsWith("/results")
		) {
			link.pathname = `${link.pathname.replace(/\/$/, "")}/${localDate}`;
		}
		return link.toString();
	} catch {
		return undefined;
	}
}

async function enrichWithHeadToHead(
	matches: MatchSummary[],
	cache: KVNamespace,
): Promise<MatchSummary[]> {
	return Promise.all(
		matches.map(async (match) => {
			if (!hasHeadToHeadPlayers(match)) {
				return match;
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
					expirationTtl:
						match.eventType === "live"
							? LIVE_H2H_TTL_SECONDS
							: SCHEDULED_H2H_TTL_SECONDS,
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

function displayStatus(match: BwfMatch): string {
	return (
		statusCandidates(match).find((status) => status.toLowerCase() !== "none") ||
		"Live"
	);
}

function statusCandidates(match: BwfMatch): string[] {
	return [
		match.matchStatusValue,
		match.scoreStatusValue,
		match.matchStatus,
		match.scoreStatus == null ? undefined : String(match.scoreStatus),
	]
		.map((status) => status?.trim())
		.filter((status): status is string => Boolean(status));
}

async function fetchBwfJson(url: string): Promise<unknown> {
	const response = await fetch(url, {
		headers: {
			accept: "application/json,text/plain,*/*",
			"accept-language": "ja,en-US;q=0.9,en;q=0.8",
			referer: "https://bwfbadminton.com/",
			"user-agent":
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
		},
	});

	if (!response.ok) {
		throw new Error(`BWF request failed with status ${response.status}`);
	}

	return response.json();
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
