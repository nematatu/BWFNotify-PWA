import { For, Show } from "solid-js";
import type { MatchSummary, MatchTeamSummary } from "../../type";
import { displayRound, formatScheduleDate } from "../lib/format";
import { recentResults } from "../lib/matchesState";
import { proxiedImageUrl } from "../lib/media";
import {
	groupResultsByDay,
	orderedResultScores,
	type ResultView,
	resultView,
} from "../lib/resultView";

type TeamResult = "WIN" | "LOSE" | "未確定";

const OUTCOME_DISPLAY: Record<
	ResultView["outcome"],
	{ className: string; label: string }
> = {
	win: { className: "result-win", label: "WIN" },
	loss: { className: "result-loss", label: "LOSE" },
	"japanese-match": { className: "result-japanese-match", label: "日本人対決" },
	unknown: { className: "result-unknown", label: "結果未確定" },
};

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
	const isJapaneseMatch = () => view().kind === "japanese-match";
	const teamAt = (index: 1 | 2) => props.match.teams[index - 1];
	/** 日本人対決のときだけ、各チームに勝敗を表示する。 */
	const resultOf = (index: 1 | 2) =>
		isJapaneseMatch() ? teamResult(view().winner, index) : undefined;

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
					teamResult={resultOf(view().leftIndex)}
				/>
				<div class="result-score">
					<span class="visually-hidden">ゲームスコア</span>
					<For each={orderedResultScores(props.match, view().leftIndex)}>
						{(score) => <span>{score}</span>}
					</For>
				</div>
				<ResultTeam
					team={teamAt(view().rightIndex)}
					isJapanese={isJapaneseMatch()}
					teamResult={resultOf(view().rightIndex)}
				/>
			</div>
		</article>
	);
}

function ResultTeam(props: {
	team: MatchTeamSummary | undefined;
	isJapanese: boolean;
	teamResult?: TeamResult;
}) {
	const players = () => props.team?.players || [];
	return (
		<div class={`result-team ${props.isJapanese ? "result-team-japan" : ""}`}>
			<div class="result-player-photos">
				<For each={players().filter((player) => player.photoUrl)}>
					{(player) => (
						<img
							class="result-player-photo"
							loading="lazy"
							decoding="async"
							src={proxiedImageUrl(player.photoUrl, "photo")}
							alt={`${player.name}選手`}
						/>
					)}
				</For>
			</div>
			<div class="result-team-head">
				<Show when={props.team?.flagUrl}>
					<img
						class="result-flag"
						loading="lazy"
						decoding="async"
						src={proxiedImageUrl(props.team?.flagUrl, "flag")}
						alt={props.team?.countryCode || "国旗"}
					/>
				</Show>
				<Show when={props.teamResult}>
					<span class="team-result">{props.teamResult}</span>
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
		</div>
	);
}

function teamResult(winner: 1 | 2 | undefined, team: 1 | 2): TeamResult {
	if (!winner) return "未確定";
	return winner === team ? "WIN" : "LOSE";
}
