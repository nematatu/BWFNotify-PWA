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

export function orderedResultScores(match: MatchSummary, leftIndex: 1 | 2) {
	return match.scores.map((game) =>
		leftIndex === 1
			? `${game.team1} - ${game.team2}`
			: `${game.team2} - ${game.team1}`,
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
