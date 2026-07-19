import type { MatchSummary } from "../type";

export const DEFAULT_SORT_ORDER = "time-asc";

export interface TournamentGroup {
	name: string;
	logoUrl?: string;
	matches: MatchSummary[];
}

export function sortedMatches(
	matches: MatchSummary[],
	sortOrder = DEFAULT_SORT_ORDER,
): MatchSummary[] {
	const direction = sortOrder === "time-desc" ? -1 : 1;
	return [...matches].sort(
		(left, right) => direction * compareStartTime(left, right),
	);
}

export function tournamentGroups(matches: MatchSummary[]): TournamentGroup[] {
	const groups = new Map<string, TournamentGroup>();
	const sorted = sortedMatches(matches);
	for (const match of sorted) {
		const name = String(match.tournament || "BWF");
		const current = groups.get(name);
		if (current) {
			current.matches.push(match);
		} else {
			groups.set(name, {
				name,
				logoUrl: match.tournamentLogoUrl,
				matches: [match],
			});
		}
	}
	return [...groups.values()].sort((left, right) =>
		left.name.localeCompare(right.name, "ja"),
	);
}

export function previousGameScoreline(
	games?: Array<{ team1: number; team2: number }> | null,
): string {
	if (!Array.isArray(games)) {
		return "";
	}
	return games
		.filter(
			(game) => Number.isFinite(game?.team1) && Number.isFinite(game?.team2),
		)
		.map((game) => `${game.team1}-${game.team2}`)
		.join(" / ");
}

export function mergeLiveMatches(
	currentMatches: MatchSummary[],
	freshMatches: MatchSummary[],
): MatchSummary[] {
	const currentById = new Map<string, MatchSummary>(
		currentMatches.map((match) => [match.id, match]),
	);
	const freshLive = freshMatches.filter((match) => match.eventType === "live");
	const freshLiveIds = new Set(freshLive.map((match) => match.id));
	const mergedLive = freshLive.map((fresh) => {
		const current = currentById.get(fresh.id);
		const merged: MatchSummary & { scoreChangedTeam?: 1 | 2 } = {
			...(current || {}),
			...fresh,
		};
		merged.scoreChangedTeam = changedScoreTeam(current, fresh);
		if (current?.h2h && !fresh.h2h) {
			merged.h2h = current.h2h;
		}
		if (!fresh.youtubeUrl) {
			merged.youtubeUrl = isDirectYoutubeUrl(current?.youtubeUrl)
				? current?.youtubeUrl || ""
				: "";
		}
		return merged;
	});
	const scheduled = currentMatches.filter(
		(match) => match.eventType === "scheduled" && !freshLiveIds.has(match.id),
	);
	return [...mergedLive, ...scheduled];
}

function changedScoreTeam(
	current: MatchSummary | undefined,
	fresh: MatchSummary,
): 1 | 2 | undefined {
	const previous = current?.scores?.at(-1);
	const next = fresh?.scores?.at(-1);
	if (!previous || !next) {
		return undefined;
	}
	const unchanged =
		previous.game === next.game &&
		previous.team1 === next.team1 &&
		previous.team2 === next.team2;
	if (unchanged) {
		return undefined;
	}
	if (next.lastPointWinner === 1 || next.lastPointWinner === 2) {
		return next.lastPointWinner;
	}
	if (next.team1 > previous.team1 && next.team2 === previous.team2) {
		return 1;
	}
	if (next.team2 > previous.team2 && next.team1 === previous.team1) {
		return 2;
	}
	return undefined;
}

function isDirectYoutubeUrl(value: string | undefined): boolean {
	if (!value) {
		return false;
	}
	try {
		const url = new URL(value);
		return (
			(url.hostname === "youtu.be" && /^\/[\w-]{11}$/.test(url.pathname)) ||
			(["youtube.com", "www.youtube.com", "m.youtube.com"].includes(
				url.hostname,
			) &&
				url.pathname === "/watch" &&
				/^[\w-]{11}$/.test(url.searchParams.get("v") || ""))
		);
	} catch {
		return false;
	}
}

function compareStartTime(left: MatchSummary, right: MatchSummary): number {
	return String(left.startTime || "\uffff").localeCompare(
		String(right.startTime || "\uffff"),
	);
}
