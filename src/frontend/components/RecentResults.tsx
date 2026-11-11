import { createMemo, createSignal, For, Show } from "solid-js";
import type { MatchSummary, MatchTeamSummary } from "../../type";
import { displayRound, formatScheduleDate, japanDateKey } from "../lib/format";
import { matches, recentResults } from "../lib/matchesState";
import { proxiedImageUrl } from "../lib/media";
import {
	countOutcomes,
	filterResults,
	gamesWon,
	groupResultsByDay,
	orderedGameScores,
	type ResultFilter,
	type ResultView,
	resultView,
	todayTournamentRecords,
} from "../lib/resultView";
import { EmptyState } from "./EmptyState";

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

const FILTERS: Array<{ value: ResultFilter; label: string }> = [
	{ value: "all", label: "すべて" },
	{ value: "win", label: "勝ち" },
	{ value: "loss", label: "負け" },
];

export function RecentResults() {
	const [filter, setFilter] = createSignal<ResultFilter>("all");
	const totals = createMemo(() => countOutcomes(recentResults()));
	// 絞り込みでは行を作り直さず、該当しない行を隠すだけにする（スマホでの切り替えを速くするため）
	const days = createMemo(() => groupResultsByDay(recentResults()));
	const matchesFilter = (match: MatchSummary) =>
		filter() === "all" || resultView(match).outcome === filter();
	const hasVisibleRows = () => recentResults().some(matchesFilter);

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
			<TodayRecords />
			<Show
				when={recentResults().length > 0}
				fallback={
					<EmptyState
						class="data-empty"
						message="取得済みの試合結果はありません"
					/>
				}
			>
				{/* 日本人選手の勝敗の集計と、勝ち・負けの絞り込み */}
				<div class="result-summary">
					<p class="result-totals">
						<span class="result-totals-label">日本人選手</span>
						<span class="result-total-win">{totals().win}勝</span>
						<span class="result-total-loss">{totals().loss}敗</span>
					</p>
					<fieldset class="result-filter">
						<legend class="visually-hidden">試合結果の絞り込み</legend>
						<For each={FILTERS}>
							{(option) => (
								<button
									type="button"
									aria-pressed={filter() === option.value}
									onClick={() => setFilter(option.value)}
								>
									{option.label}
								</button>
							)}
						</For>
					</fieldset>
				</div>
				<Show when={!hasVisibleRows()}>
					<p class="data-empty">該当する試合はありません</p>
				</Show>
				<For each={days()}>
					{(day) => {
						const dayTotals = () =>
							countOutcomes(filterResults(day.matches, filter()));
						return (
							<section
								class="result-day"
								hidden={!day.matches.some(matchesFilter)}
							>
								<h3 class="result-day-heading">
									<Show when={day.date} fallback="日付不明">
										{(date) => (
											<time datetime={date()}>
												{formatScheduleDate(date())}
											</time>
										)}
									</Show>
									<span class="result-day-totals">
										{dayTotals().win}勝 {dayTotals().loss}敗
									</span>
								</h3>
								<div class="result-list">
									<For each={day.matches}>
										{(match) => (
											<ResultRow match={match} hidden={!matchesFilter(match)} />
										)}
									</For>
								</div>
							</section>
						);
					}}
				</For>
			</Show>
		</section>
	);
}

/** 今日の日本人選手の成績を大会ごとに出す。終わっていない大会は残りの試合数を出す。 */
function TodayRecords() {
	const records = createMemo(() =>
		todayTournamentRecords(recentResults(), matches(), japanDateKey()),
	);
	return (
		<Show when={records().length > 0}>
			<section class="today-records" aria-labelledby="today-records-heading">
				<h3 id="today-records-heading" class="today-records-heading">
					今日の成績
				</h3>
				<ul class="today-records-list">
					<For each={records()}>
						{(record) => (
							<li>
								<span class="today-record-tournament">{record.tournament}</span>
								<Show
									when={record.remaining === 0}
									fallback={
										<span class="today-record-remaining">
											残り{record.remaining}試合
										</span>
									}
								>
									<span class="today-record-result">
										{record.win}勝{record.loss}敗
									</span>
								</Show>
							</li>
						)}
					</For>
				</ul>
			</section>
		</Show>
	);
}

function ResultRow(props: { match: MatchSummary; hidden: boolean }) {
	const view = () => resultView(props.match);
	const outcome = () => OUTCOME_DISPLAY[view().outcome];
	const games = () => gamesWon(props.match, view().leftIndex);
	const isJapaneseMatch = () => view().kind === "japanese-match";
	const teamAt = (index: 1 | 2) => props.match.teams[index - 1];

	return (
		<article class={`result-row ${outcome().className}`} hidden={props.hidden}>
			{/* 日本人選手側から見た勝敗を、カード上部の帯で示す */}
			<div class="result-header">
				<span class="result-outcome">{outcome().label}</span>
				<Show when={!isJapaneseMatch() && view().winner}>
					<span class="result-games">
						<span class="visually-hidden">取ったゲーム数 </span>
						{games().left}-{games().right}
					</span>
				</Show>
			</div>
			{/* 大会名とラウンドは帯の下に置き、カードの中身と左端をそろえる */}
			<div class="result-meta">
				<span class="result-tournament">{props.match.tournament}</span>
				<Show when={props.match.round}>
					<span class="result-round">{displayRound(props.match.round)}</span>
				</Show>
			</div>
			<div class="result-matchup">
				<ResultTeam
					team={teamAt(view().leftIndex)}
					isJapanese={true}
					won={view().winner === view().leftIndex}
					showWinLabel={isJapaneseMatch()}
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
					isJapanese={isJapaneseMatch()}
					won={view().winner === view().rightIndex}
					showWinLabel={isJapaneseMatch()}
				/>
			</div>
		</article>
	);
}

function ResultTeam(props: {
	team: MatchTeamSummary | undefined;
	isJapanese: boolean;
	/** この側が勝ったか */
	won: boolean;
	/** 日本人対決のときだけ、勝った側に「勝ち」の印を付ける */
	showWinLabel: boolean;
}) {
	const players = () => props.team?.players || [];
	return (
		<div
			class="result-team"
			classList={{
				"result-team-japan": props.isJapanese,
				// 勝った日本人選手の欄だけ背景色を付ける。負けた試合では付けない
				"result-team-japan-won": props.isJapanese && props.won,
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
								<span class="result-name-separator">、</span>
							</Show>
							<span>{player.name}</span>
						</div>
					)}
				</For>
			</div>
			<Show when={props.showWinLabel && props.won}>
				<span class="team-result">勝ち</span>
			</Show>
		</div>
	);
}
