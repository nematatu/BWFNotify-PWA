import { japanesePlayerName } from "../config/japanese-player-names";
import type {
	BwfGameScore,
	BwfMatch,
	BwfTeam,
	EventType,
	MatchPlayerSummary,
	MatchSummary,
	MatchTeamSummary,
} from "../type";

const TARGET_COUNTRY = "JPN";

export function extractJapaneseMatches(matches: BwfMatch[]): MatchSummary[] {
	const seen = new Set<string>();
	const result: MatchSummary[] = [];

	for (const match of matches) {
		const type = eventType(match);
		if (
			(type !== "live" && type !== "scheduled" && type !== "completed") ||
			!includesCountry(match, TARGET_COUNTRY) ||
			seen.has(match.id)
		) {
			continue;
		}

		seen.add(match.id);
		const teamsWithSource = [match.team1, match.team2]
			.map((team, sourceIndex) => ({ team: toTeamSummary(team), sourceIndex }))
			.filter(
				(value): value is { team: MatchTeamSummary; sourceIndex: number } =>
					value.team != null,
			)
			.sort(
				(left, right) =>
					Number(teamIsJapanese(right.team)) -
					Number(teamIsJapanese(left.team)),
			);
		const teams = teamsWithSource.map(({ team }) => team);
		result.push({
			id: match.id,
			tournament: match.tournamentName || "BWF",
			tournamentLogoUrl: match.tournamentLogoUrl,
			tournamentHeaderImageUrl: match.tournamentHeaderImageUrl,
			tournamentHeaderImageMobileUrl: match.tournamentHeaderImageMobileUrl,
			tournamentCategory: match.tournamentCategory,
			youtubeUrl: "",
			players: teams.map(teamName).filter(Boolean),
			teams,
			scores: matchScores(match.score, teamsWithSource[0]?.sourceIndex === 1),
			eventType: type,
			round: match.roundName || match.matchTypeValue,
			court: match.courtName,
			startTime: match.matchTimeUtc || match.matchTime,
			tournamentDate: match.matchTime?.match(/^\d{4}-\d{2}-\d{2}/)?.[0],
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
	if (isMatchCompleted(match.score)) return "completed";
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

function isMatchCompleted(scores?: BwfGameScore[]): boolean {
	let homeWins = 0;
	let awayWins = 0;
	for (const score of scores || []) {
		const winner = gameWinner(score.home, score.away);
		if (winner === "home") homeWins++;
		if (winner === "away") awayWins++;
	}
	return homeWins >= 2 || awayWins >= 2;
}

function gameWinner(home: number, away: number): "home" | "away" | null {
	if (home === 30 || (home >= 21 && home - away >= 2)) return "home";
	if (away === 30 || (away >= 21 && away - home >= 2)) return "away";
	return null;
}

function includesCountry(match: BwfMatch, country: string): boolean {
	return [match.team1, match.team2].some(
		(team) =>
			team?.countryCode === country ||
			team?.players.some((player) => player.countryCode === country),
	);
}

function toTeamSummary(team: BwfTeam | undefined): MatchTeamSummary | null {
	if (!team) return null;
	const players = team.players
		.map((player): MatchPlayerSummary | null => {
			if (!player.nameDisplay) return null;
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

function matchScores(score: BwfGameScore[] | undefined, swapTeams: boolean) {
	return (score || []).map((game) => ({
		game: game.set,
		team1: swapTeams ? game.away : game.home,
		team2: swapTeams ? game.home : game.away,
		lastPointWinner: swapTeamNumber(game.lastPointWinner, swapTeams),
		servingTeam: swapTeamNumber(game.serve, swapTeams),
	}));
}

function swapTeamNumber(
	value: 1 | 2 | undefined,
	swapTeams: boolean,
): 1 | 2 | undefined {
	return value == null || !swapTeams ? value : value === 1 ? 2 : 1;
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

function isPresent<T>(value: T | null | undefined): value is T {
	return value != null;
}
