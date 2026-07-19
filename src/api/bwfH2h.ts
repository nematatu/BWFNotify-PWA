import type { HeadToHeadSummary, MatchSummary, PreviousMeeting } from "../type";
import { array, object, optionalString } from "../utils";

const BWF_H2H_URL = "https://extranet-lv.bwfbadminton.com/api/h2h/statistics";
const H2H_CACHE_PREFIX = "bwf:h2h:v3:";
const H2H_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;

export async function enrichWithHeadToHead(
	matches: MatchSummary[],
	cache: KVNamespace,
	knownMatches: MatchSummary[],
	fetchJson: (url: string) => Promise<unknown>,
): Promise<MatchSummary[]> {
	const known = new Map(
		knownMatches
			.filter((match) => match.h2h)
			.map((match) => [match.id, match.h2h] as const),
	);
	return Promise.all(
		matches.map(async (match) => {
			if (!hasHeadToHeadPlayers(match)) return match;
			const knownValue = known.get(match.id);
			if (knownValue) return { ...match, h2h: knownValue };

			const key = `${H2H_CACHE_PREFIX}${match.id}`;
			const cached = await cache.get<HeadToHeadSummary>(key, "json");
			if (cached) return { ...match, h2h: cached };

			try {
				const h2h = parseHeadToHead(
					await fetchJson(headToHeadUrl(match)),
					match.teams.map((team) =>
						team.players.map((player) => player.id).filter(isPresent),
					),
				);
				if (!h2h) return match;
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

export function parseHeadToHead(
	payload: unknown,
	currentTeamPlayerIds?: string[][],
): HeadToHeadSummary | null {
	const root = object(payload);
	const stats = object(root.stats);
	const team1Wins = optionalNumber(object(stats.team1).totalWins);
	const team2Wins = optionalNumber(object(stats.team2).totalWins);
	const totalMatches = optionalNumber(stats.totalMatches);
	if (team1Wins == null || team2Wins == null || totalMatches == null)
		return null;

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
	if (!tournamentName || games.length === 0) return null;

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
	if (currentTeamPlayerIds?.length !== 2) return false;
	const item = object(value);
	return (
		samePlayerIds(
			previousPlayerIds(item.team1),
			currentTeamPlayerIds[1] || [],
		) &&
		samePlayerIds(previousPlayerIds(item.team2), currentTeamPlayerIds[0] || [])
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

function isPresent<T>(value: T | null | undefined): value is T {
	return value != null;
}
