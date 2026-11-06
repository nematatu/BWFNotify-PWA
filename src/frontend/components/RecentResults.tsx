import { For, Show } from "solid-js";
import type { MatchSummary, MatchTeamSummary } from "../../type";
import { displayRound, formatScheduleDate } from "../lib/format";
import { recentResults } from "../lib/matchesState";
import { proxiedImageUrl } from "../lib/media";
import {
	groupResultsByDay,
	orderedGameScores,
	type ResultView,
	resultView,
} from "../lib/resultView";

/** 日本人選手側から見た勝敗。色と文言を1か所で決める。 */
const OUTCOME_DISPLAY: Record<
	ResultView["outcome"],
	{ className: string; label: string }
> = {
	win: { className: "result-win", label: "勝ち" },
	loss: { className: "result-loss", label: "負け" },
	"japanese-match": { className: "result-japanese-match", label: "日本人対決" },
	unknown: { className: "result-unknown", label: "結果未確定" },
};

type TeamStanding = "winner" | "loser" | "undecided";

export function RecentResults() {
	return (
		<section
			class="data-section tab-data-section"
			aria-labelledby="results-tab"
			role="tabpanel"
		>
			<div class="data-section-heading">
				<div>
					<h2 id="results-heading">直近7日間の結果</h2>
					<p>日本選手が出場した試合</p>
				</div>
				<span>{recentResults().length}試合</span>
			</div>
			<Show
				when={recentResults().length > 0}
				fallback={<p class="data-empty">取得済みの試合結果はありません</p>}
			>
				<For each={groupResultsByDay(recentResults())}>
					{(day) => (
						<section class="result-day">
							<h3 class="result-day-heading">
								<Show when={day.date} fallback="日付不明">
									{(date) => (
										<time datetime={date()}>{formatScheduleDate(date())}</time>
									)}
								</Show>
								<span>{day.matches.length}試合</span>
							</h3>
							<div class="result-list">
								<For each={day.matches}>
									{(match) => <ResultRow match={match} />}
								</For>
							</div>
						</section>
					)}
				</For>
			</Show>
		</section>
	);
}

function ResultRow(props: { match: MatchSummary }) {
	const view = () => resultView(props.match);
	const outcome = () => OUTCOME_DISPLAY[view().outcome];
	const teamAt = (index: 1 | 2) => props.match.teams[index - 1];
	/** 勝敗が決まっている試合では、勝った側に印を付け、負けた側を淡く表示する。 */
	const standing = (index: 1 | 2): TeamStanding => {
		const winner = view().winner;
		if (!winner) return "undecided";
		return winner === index ? "winner" : "loser";
	};

	return (
		<article class={`result-row ${outcome().className}`}>
			<div class="result-header">
				<span class="result-outcome">{outcome().label}</span>
				<div class="result-meta">
					<span class="result-tournament">{props.match.tournament}</span>
					<Show when={props.match.round}>
						<span class="result-round">{displayRound(props.match.round)}</span>
					</Show>
				</div>
			</div>
			<div class="result-matchup">
				<ResultTeam
					team={teamAt(view().leftIndex)}
					isJapanese={true}
					standing={standing(view().leftIndex)}
				/>
				<div class="result-score">
					<span class="visually-hidden">ゲームスコア</span>
					<For each={orderedGameScores(props.match, view().leftIndex)}>
						{(game) => (
							<span class="result-game">
								<span classList={{ "game-won": game.left > game.right }}>
									{game.left}
								</span>
								<span class="result-game-separator">-</span>
								<span classList={{ "game-won": game.right > game.left }}>
									{game.right}
								</span>
							</span>
						)}
					</For>
				</div>
				<ResultTeam
					team={teamAt(view().rightIndex)}
					isJapanese={view().kind === "japanese-match"}
					standing={standing(view().rightIndex)}
				/>
			</div>
		</article>
	);
}

function ResultTeam(props: {
	team: MatchTeamSummary | undefined;
	isJapanese: boolean;
	standing: TeamStanding;
}) {
	const players = () => props.team?.players || [];
	return (
		<div
			class="result-team"
			classList={{
				"result-team-japan": props.isJapanese,
				"result-team-winner": props.standing === "winner",
				"result-team-loser": props.standing === "loser",
			}}
		>
			<div class="result-player-photos">
				<For each={players().filter((player) => player.photoUrl)}>
					{(player) => (
						<img
							loading="lazy"
							decoding="async"
							class="result-player-photo"
							src={proxiedImageUrl(player.photoUrl, "photo")}
							alt={`${player.name}選手`}
						/>
					)}
				</For>
			</div>
			<div class="result-team-head">
				<Show when={props.team?.flagUrl}>
					<img
						loading="lazy"
						decoding="async"
						class="result-flag"
						src={proxiedImageUrl(props.team?.flagUrl, "flag")}
						alt={props.team?.countryCode || "国旗"}
					/>
				</Show>
			</div>
			<div class="result-player-names">
				<For each={players()}>
					{(player, index) => (
						<div>
							<Show when={index() > 0}>
								<span class="result-name-separator">/</span>
							</Show>
							<span>{player.name}</span>
						</div>
					)}
				</For>
			</div>
			{/* 勝った側にだけ印を付ける（名前の下に置き、左右の位置をそろえる） */}
			<Show when={props.standing === "winner"}>
				<span class="team-result">勝ち</span>
			</Show>
		</div>
	);
}
