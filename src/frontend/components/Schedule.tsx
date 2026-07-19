import { ChevronDown } from "lucide-solid";
import { For, Show } from "solid-js";
import type {
	MatchSummary,
	MatchTeamSummary,
	UpcomingTournament,
} from "../../type";
import { recentResults, upcomingTournaments } from "../lib/matchesState";
import {
	displayRound,
	formatTournamentDate,
	proxiedImageUrl,
} from "../lib/utils";

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
	const japaneseIndex = () =>
		props.match.teams[0]?.players.some((player) => player.isJapanese) ? 1 : 2;
	const japaneseTeam = () => props.match.teams[japaneseIndex() - 1];
	const opponentTeam = () => props.match.teams[japaneseIndex() === 1 ? 1 : 0];
	const winner = () => winnerTeam(props.match);
	const japaneseWon = () => winner() === japaneseIndex();
	const resultClass = () =>
		winner()
			? japaneseWon()
				? "result-win"
				: "result-loss"
			: "result-unknown";
	return (
		<article class={`result-row ${resultClass()}`}>
			<div class="result-summary">
				<div class="result-date">
					{formatTournamentDate(matchDate(props.match))}
				</div>
				<Show when={winner()}>
					<span class="result-outcome">{japaneseWon() ? "WIN" : "LOSE"}</span>
				</Show>
			</div>
			<div class="result-matchup">
				<ResultTeam
					team={japaneseTeam()}
					isJapanese={true}
					isWinner={japaneseWon()}
				/>
				<div class="result-score">
					<span class="visually-hidden">ゲームスコア</span>
					<For each={orderedScores(props.match, japaneseIndex())}>
						{(score) => <span>{score}</span>}
					</For>
				</div>
				<ResultTeam
					team={opponentTeam()}
					isJapanese={false}
					isWinner={Boolean(winner()) && !japaneseWon()}
				/>
			</div>
			<details class="result-details">
				<summary>
					詳細 <ChevronDown size={14} aria-hidden="true" />
				</summary>
				<div>
					<span>{props.match.tournament}</span>
					<Show when={props.match.round}>
						<span>{displayRound(props.match.round)}</span>
					</Show>
				</div>
			</details>
		</article>
	);
}

function ResultTeam(props: {
	team: MatchTeamSummary | undefined;
	isJapanese: boolean;
	isWinner: boolean;
}) {
	return (
		<div class={`result-team ${props.isJapanese ? "result-team-japan" : ""}`}>
			<div class="result-team-head">
				<Show when={props.team?.flagUrl}>
					<img
						class="result-flag"
						src={proxiedImageUrl(props.team?.flagUrl)}
						alt={props.team?.countryCode || "国旗"}
					/>
				</Show>
				<span
					class={props.isWinner ? "team-result-winner" : "team-result-loser"}
				>
					{props.isWinner ? "勝者" : "敗者"}
				</span>
			</div>
			<div class="result-player-names">
				<For each={props.team?.players || []}>
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

export function UpcomingSchedule() {
	return (
		<section
			class="data-section tab-data-section"
			aria-labelledby="upcoming-tab"
			role="tabpanel"
		>
			<div class="data-section-heading">
				<h2 id="schedule-heading">今後の大会</h2>
			</div>
			<Show
				when={upcomingTournaments().length > 0}
				fallback={<p class="data-empty">今後の大会はありません</p>}
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
			</div>
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

function orderedScores(match: MatchSummary, japaneseIndex: 1 | 2) {
	return match.scores.map((game) =>
		japaneseIndex === 1
			? `${game.team1} - ${game.team2}`
			: `${game.team2} - ${game.team1}`,
	);
}

function matchDate(match: MatchSummary) {
	return match.tournamentDate || match.startTime?.slice(0, 10);
}
