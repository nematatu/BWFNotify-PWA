import { ExternalLink } from "lucide-solid";
import { For, Show } from "solid-js";
import type { MatchSummary, UpcomingTournament } from "../../type";
import {
	calendarCheckedAt,
	recentResults,
	upcomingTournaments,
} from "../lib/matchesState";
import {
	displayRound,
	displayTournamentCategory,
	formatDate,
	formatTournamentDate,
	teamLabel,
} from "../lib/utils";

export function RecentResults() {
	return (
		<section class="data-section" aria-labelledby="results-heading">
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
				<div class="result-list">
					<For each={recentResults()}>
						{(match) => <ResultRow match={match} />}
					</For>
				</div>
			</Show>
		</section>
	);
}

function ResultRow(props: { match: MatchSummary }) {
	const winner = () => winnerTeam(props.match);
	return (
		<article class="result-row">
			<div class="result-meta">
				<span>{formatTournamentDate(matchDate(props.match))}</span>
				<span>{props.match.tournament}</span>
				<Show when={props.match.round}>
					<span>{displayRound(props.match.round)}</span>
				</Show>
			</div>
			<div class="result-matchup">
				<strong class={winner() === 1 ? "result-winner" : ""}>
					{teamLabel(props.match.teams[0])}
				</strong>
				<span class="result-score">{scoreline(props.match)}</span>
				<strong class={winner() === 2 ? "result-winner" : ""}>
					{teamLabel(props.match.teams[1])}
				</strong>
			</div>
		</article>
	);
}

export function UpcomingSchedule() {
	return (
		<section class="data-section" aria-labelledby="schedule-heading">
			<div class="data-section-heading">
				<div>
					<h2 id="schedule-heading">今後の大会</h2>
					<p>日本バドミントン協会の公式資料を確認</p>
				</div>
				<Show when={calendarCheckedAt()}>
					<time dateTime={calendarCheckedAt() || undefined}>
						{calendarIsStale(calendarCheckedAt())
							? "更新遅延 / 最終確認 "
							: "確認 "}
						{formatDate(calendarCheckedAt() || "")}
					</time>
				</Show>
				<Show when={!calendarCheckedAt()}>
					<span>公式情報の確認待ち</span>
				</Show>
			</div>
			<Show
				when={upcomingTournaments().length > 0}
				fallback={
					<p class="data-empty">出場情報がある今後の大会はありません</p>
				}
			>
				<div class="upcoming-list">
					<For each={upcomingTournaments()}>
						{(tournament) => <TournamentRow tournament={tournament} />}
					</For>
				</div>
			</Show>
		</section>
	);
}

function TournamentRow(props: { tournament: UpcomingTournament }) {
	const tournament = () => props.tournament;
	return (
		<article class="upcoming-row">
			<div class="upcoming-main">
				<p class="upcoming-date">
					{formatTournamentDate(tournament().startDate)} -{" "}
					{formatTournamentDate(tournament().endDate)}
				</p>
				<h3>{tournament().name}</h3>
				<p class="upcoming-place">
					{[
						displayTournamentCategory(tournament().category),
						tournament().place,
					]
						.filter(Boolean)
						.join(" / ")}
				</p>
			</div>
			<div class="availability-list">
				<p>
					<strong>組み合わせ</strong>
					<span>
						{tournament().matchDataAvailable
							? "「このあと」に表示中"
							: "BWF試合データには未反映"}
					</span>
				</p>
				<p>
					<strong>開始時刻・コート</strong>
					<span>{tournament().timetableAvailable ? "公開済み" : "未反映"}</span>
				</p>
			</div>
			<details class="participant-list">
				<summary>出場日本選手 {tournament().japanesePlayers.length}名</summary>
				<p>
					{tournament().japanesePlayers.join("、") ||
						"選手名を取得できませんでした"}
				</p>
			</details>
			<nav class="official-links" aria-label={`${tournament().name}の公式情報`}>
				<Show when={tournament().officialUrl}>
					<a
						href={tournament().officialUrl}
						target="_blank"
						rel="noopener noreferrer"
					>
						BWF大会情報 <ExternalLink size={14} aria-hidden="true" />
					</a>
				</Show>
				<For each={tournament().participantSourceUrls}>
					{(url, index) => (
						<a href={url} target="_blank" rel="noopener noreferrer">
							BAJ公式資料
							{tournament().participantSourceUrls.length > 1 ? index() + 1 : ""}{" "}
							<ExternalLink size={14} aria-hidden="true" />
						</a>
					)}
				</For>
			</nav>
		</article>
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

function scoreline(match: MatchSummary) {
	return match.scores.map((game) => `${game.team1}-${game.team2}`).join(" / ");
}

function matchDate(match: MatchSummary) {
	return match.tournamentDate || match.startTime?.slice(0, 10);
}

function calendarIsStale(value: string | null) {
	const checked = value ? Date.parse(value) : Number.NaN;
	return (
		!Number.isFinite(checked) || Date.now() - checked > 24 * 60 * 60 * 1000
	);
}
