import type {
	BwfMatch,
	BwfPlayer,
	BwfTeam,
	EventType,
	LiveMatch,
} from "./types";
import {
	adjacentDates,
	array,
	object,
	optionalString,
	todayJst,
} from "./utils";

const BWF_LIVE_URL =
	"https://extranet-lv.bwfbadminton.com/api/match-center/vue-current-live";
const BWF_DAY_MATCHES_URL =
	"https://extranet-lv.bwfbadminton.com/api/tournaments/day-matches";
const TARGET_COUNTRY = "JPN";

type Tournament = {
	code: string;
	name?: string;
};

export async function fetchJapaneseLiveMatches(): Promise<LiveMatch[]> {
	const tournaments = tournamentsFrom(await fetchBwfJson(BWF_LIVE_URL));
	const dates = adjacentDates(todayJst());
	const matches: BwfMatch[] = [];

	for (const tournament of tournaments) {
		for (const date of dates) {
			const payload = await fetchBwfJson(dayMatchesUrl(tournament.code, date));
			matches.push(...array(payload).map(parseMatch).filter(isPresent));
		}
	}

	return extractJapaneseLiveMatches(matches);
}

export function extractJapaneseLiveMatches(matches: BwfMatch[]): LiveMatch[] {
	const seen = new Set<string>();
	const result: LiveMatch[] = [];

	for (const match of matches) {
		if (
			eventType(match) !== "live" ||
			!includesCountry(match, TARGET_COUNTRY) ||
			seen.has(match.id)
		) {
			continue;
		}

		seen.add(match.id);
		result.push({
			id: match.id,
			tournament: match.tournamentName || "BWF",
			players: matchNames(match),
			status: displayStatus(match),
			round: match.roundName || match.matchTypeValue,
			court: match.courtName,
			startTime: match.matchTimeUtc || match.matchTime,
		});
	}

	return result.sort((left, right) => left.id.localeCompare(right.id));
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
		}))
		.filter((item) => /^[0-9A-F-]{36}$/i.test(item.code));
}

function parseMatch(value: unknown): BwfMatch | null {
	const item = object(value);
	const rawId = item.id;
	if (typeof rawId !== "string" && typeof rawId !== "number") {
		return null;
	}

	return {
		id: String(rawId),
		tournamentName: optionalString(item.tournamentName),
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
		players: array(item.players).map(parsePlayer).filter(isPresent),
	};
}

function parsePlayer(value: unknown): BwfPlayer | null {
	const item = object(value);
	const nameDisplay = optionalString(item.nameDisplay);
	const countryCode = optionalString(item.countryCode)?.toUpperCase();
	return nameDisplay || countryCode ? { nameDisplay, countryCode } : null;
}

function includesCountry(match: BwfMatch, country: string): boolean {
	return [match.team1, match.team2].some(
		(team) =>
			team?.countryCode === country ||
			team?.players.some((player) => player.countryCode === country),
	);
}

function matchNames(match: BwfMatch): string[] {
	return [match.team1, match.team2]
		.map((team) =>
			team?.players
				.map((player) => player.nameDisplay)
				.filter((name): name is string => Boolean(name))
				.join(" / "),
		)
		.filter((name): name is string => Boolean(name));
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
