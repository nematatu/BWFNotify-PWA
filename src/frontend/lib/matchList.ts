import type { MatchSummary } from "../../type";

// --- 並び替え ---

export type SortOrder = "time-asc" | "time-desc" | "tournament";
export const DEFAULT_SORT_ORDER: SortOrder = "time-asc";

/** 開始時刻がない試合を末尾へ回すための番兵。 */
const NO_START_TIME = "￿";

export const sortedMatches = (
	matches: MatchSummary[],
	order: SortOrder = DEFAULT_SORT_ORDER,
) => {
	const direction = order === "time-desc" ? -1 : 1;
	return [...matches].sort(
		(left, right) =>
			direction *
			String(left.startTime || NO_START_TIME).localeCompare(
				String(right.startTime || NO_START_TIME),
			),
	);
};

export interface TournamentGroup {
	name: string;
	logoUrl?: string;
	matches: MatchSummary[];
}

/** 大会名順にまとめ、各グループ内は開始時刻順にする。 */
export const tournamentGroups = (
	matches: MatchSummary[],
): TournamentGroup[] => {
	const groups = new Map<string, TournamentGroup>();
	for (const match of sortedMatches(matches)) {
		const name = match.tournament || "BWF";
		const group = groups.get(name);
		if (group) {
			group.matches.push(match);
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
};

// --- ライブ得点の反映 ---

export type LiveMatch = MatchSummary & { scoreChangedTeam?: 1 | 2 };

/**
 * `/api/live` の結果を現在の一覧へ反映する。
 * ライブ試合は最新値に置き換え、得点した側を `scoreChangedTeam` に記録する。
 * 開始前の試合はそのまま残し、H2Hはライブ応答にない場合だけ引き継ぐ。
 */
export function mergeLiveMatches(
	currentMatches: MatchSummary[],
	freshMatches: MatchSummary[],
): LiveMatch[] {
	const currentById = new Map(currentMatches.map((match) => [match.id, match]));
	const freshLive = freshMatches.filter((match) => match.eventType === "live");
	const freshLiveIds = new Set(freshLive.map((match) => match.id));

	const mergedLive = freshLive.map((fresh): LiveMatch => {
		const current = currentById.get(fresh.id);
		const merged: LiveMatch = {
			...current,
			...fresh,
			scoreChangedTeam: changedScoreTeam(current, fresh),
		};
		// ライブ応答はH2Hを含まないことがあるため、取得済みの値を引き継ぐ。
		if (current?.h2h && !fresh.h2h) merged.h2h = current.h2h;
		return merged;
	});

	return [
		...mergedLive,
		...currentMatches.filter(
			(match) => match.eventType === "scheduled" && !freshLiveIds.has(match.id),
		),
	];
}

/**
 * `/api/status` の結果を反映するときに、より新しい `/api/live` の得点を残す。
 * 全体の情報はCron（2分ごと）の時点の値のため、15秒ごとに取得したライブ得点より
 * 古いことがある。そのまま置き換えると、得点が一瞬戻ったり、始まった試合が
 * 「このあと」へ戻ったりする。
 */
export function keepNewerLiveScores(
	currentMatches: MatchSummary[],
	statusMatches: MatchSummary[],
	liveCheckedAt: string | null,
	statusCheckedAt: string | null,
): MatchSummary[] {
	const liveTime = liveCheckedAt ? Date.parse(liveCheckedAt) : Number.NaN;
	const statusTime = statusCheckedAt ? Date.parse(statusCheckedAt) : Number.NaN;
	if (!(liveTime > statusTime)) return statusMatches;

	const currentById = new Map(currentMatches.map((match) => [match.id, match]));
	return statusMatches.map((match) => {
		const current = currentById.get(match.id);
		if (current?.eventType !== "live" || match.eventType === "completed") {
			return match;
		}
		return { ...match, eventType: "live", scores: current.scores };
	});
}

function changedScoreTeam(
	current: MatchSummary | undefined,
	fresh: MatchSummary,
): 1 | 2 | undefined {
	const previous = current?.scores?.at(-1);
	const next = fresh?.scores?.at(-1);
	if (!previous || !next) return undefined;

	const unchanged =
		previous.game === next.game &&
		previous.team1 === next.team1 &&
		previous.team2 === next.team2;
	if (unchanged) return undefined;

	if (next.lastPointWinner === 1 || next.lastPointWinner === 2) {
		return next.lastPointWinner;
	}
	if (next.team1 > previous.team1 && next.team2 === previous.team2) return 1;
	if (next.team2 > previous.team2 && next.team1 === previous.team1) return 2;
	return undefined;
}
