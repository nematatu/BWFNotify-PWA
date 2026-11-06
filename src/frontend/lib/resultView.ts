import type { MatchSummary } from "../../type";

export type ResultView = {
	kind: "international" | "japanese-match";
	leftIndex: 1 | 2;
	rightIndex: 1 | 2;
	winner?: 1 | 2;
	outcome: "win" | "loss" | "unknown" | "japanese-match";
};

export function resultView(match: MatchSummary): ResultView {
	const japaneseIndexes = match.teams.flatMap((team, index) =>
		team.players.some((player) => player.isJapanese)
			? [(index + 1) as 1 | 2]
			: [],
	);
	const winner = winnerTeam(match);

	if (japaneseIndexes.length === 2) {
		return {
			kind: "japanese-match",
			leftIndex: 1,
			rightIndex: 2,
			winner,
			outcome: "japanese-match",
		};
	}

	const leftIndex = japaneseIndexes[0] || 1;
	return {
		kind: "international",
		leftIndex,
		rightIndex: leftIndex === 1 ? 2 : 1,
		winner,
		outcome: winner ? (winner === leftIndex ? "win" : "loss") : "unknown",
	};
}

/** 各ゲームの得点を、画面の左右の並び（日本人選手が左）にそろえて返す。 */
export function orderedGameScores(match: MatchSummary, leftIndex: 1 | 2) {
	return match.scores.map((game) =>
		leftIndex === 1
			? { left: game.team1, right: game.team2 }
			: { left: game.team2, right: game.team1 },
	);
}

function winnerTeam(match: MatchSummary): 1 | 2 | undefined {
	let team1 = 0;
	let team2 = 0;
	for (const game of match.scores) {
		if (game.team1 > game.team2) team1 += 1;
		if (game.team2 > game.team1) team2 += 1;
	}
	return team1 > team2 ? 1 : team2 > team1 ? 2 : undefined;
}

/** 試合の日付（大会の現地日付、なければ開始時刻の日付）。 */
export function resultDate(match: MatchSummary): string | undefined {
	return match.tournamentDate || match.startTime?.slice(0, 10);
}

export type ResultDay = { date: string | undefined; matches: MatchSummary[] };

/**
 * 試合結果を日付ごとにまとめる。新しい日付を先にし、同じ日の中は元の順序を保つ。
 * 日付が分からない試合は最後にまとめる。
 */
export function groupResultsByDay(matches: MatchSummary[]): ResultDay[] {
	const days = new Map<string | undefined, MatchSummary[]>();
	for (const match of matches) {
		const date = resultDate(match);
		days.set(date, [...(days.get(date) || []), match]);
	}
	return [...days.entries()]
		.map(([date, dayMatches]) => ({ date, matches: dayMatches }))
		.sort((left, right) => {
			if (!left.date) return 1;
			if (!right.date) return -1;
			return right.date.localeCompare(left.date);
		});
}

/** 取ったゲーム数を、画面の左右の並び（日本人選手が左）で返す。例: { left: 2, right: 1 } */
export function gamesWon(match: MatchSummary, leftIndex: 1 | 2) {
	const games = orderedGameScores(match, leftIndex);
	return {
		left: games.filter((game) => game.left > game.right).length,
		right: games.filter((game) => game.right > game.left).length,
	};
}

export type ResultFilter = "all" | "win" | "loss";

/** 日本人選手側から見た勝ち・負けの数。日本人対決と結果未確定は数えない。 */
export function countOutcomes(matches: MatchSummary[]) {
	let win = 0;
	let loss = 0;
	for (const match of matches) {
		const { outcome } = resultView(match);
		if (outcome === "win") win += 1;
		if (outcome === "loss") loss += 1;
	}
	return { win, loss };
}

/** 勝ち・負けで絞り込む。「すべて」以外では、日本人対決と結果未確定は除く。 */
export function filterResults(
	matches: MatchSummary[],
	filter: ResultFilter,
): MatchSummary[] {
	if (filter === "all") return matches;
	return matches.filter((match) => resultView(match).outcome === filter);
}
