import { For, Show } from "solid-js";
import type { MatchSummary } from "../../type";
import {
	displayCourt,
	displayRound,
	displayTournamentCategory,
	formatMatchTime,
	formatTournamentDate,
	teamLabel,
} from "../lib/format";
import { proxiedImageUrl, youtubeLink } from "../lib/media";
import { previousGameScoreline } from "../match-groups";
import { TeamBlock } from "./TeamBlock";

export type MatchCardProps = {
	match: MatchSummary & { scoreChangedTeam?: 1 | 2 };
	showTournament?: boolean;
	notificationEnabled: boolean;
	notificationDisabled: boolean;
	onNotificationChange: (matchId: string, enabled: boolean) => void;
};

export function MatchCard(props: MatchCardProps) {
	const scores = () => props.match.scores;
	const lastScore = () => scores()?.at(-1);
	const isLive = () => props.match.eventType === "live";
	const changed = () => props.match.scoreChangedTeam;

	return (
		<div class={`match ${isLive() ? "live-match" : "scheduled-match"}`}>
			{/* Header: round, court, live badge */}
			<div class="match-header">
				<div class="match-meta">
					<Show when={props.match.round}>
						<span class="match-round">{displayRound(props.match.round)}</span>
					</Show>
					<Show when={props.match.court}>
						<span class="match-court">{displayCourt(props.match.court)}</span>
					</Show>
				</div>
				<Show when={isLive()}>
					<span class="live-badge">ライブ中</span>
				</Show>
			</div>

			{/* Tournament info (time-sorted view) */}
			<Show when={props.showTournament}>
				<div class="match-tournament">
					<Show
						when={props.match.tournamentLogoUrl}
						fallback={
							<div class="match-tournament-logo-fallback">
								{props.match.tournament}
							</div>
						}
					>
						<img
							class="match-tournament-logo"
							src={proxiedImageUrl(props.match.tournamentLogoUrl)}
							alt={props.match.tournament}
						/>
					</Show>
					<div class="match-tournament-meta">
						<h3>{props.match.tournament}</h3>
						<Show when={props.match.tournamentCategory}>
							<p class="tournament-category">
								{displayTournamentCategory(props.match.tournamentCategory)}
							</p>
						</Show>
					</div>
				</div>
			</Show>

			{/* Matchup: Team1 - Centre - Team2 */}
			<div class="matchup">
				<TeamBlock team={props.match.teams[0]} side="left" />

				<div class="match-centre">
					<Show
						when={isLive() && scores()?.length > 0}
						fallback={
							<>
								<span class="versus">vs</span>
								<span class="match-time">
									{formatMatchTime(props.match.startTime)}
								</span>
							</>
						}
					>
						<span class="current-game">GAME {scores().length}</span>
						<div class="current-score">
							<div class="score-side score-team-1">
								<Show when={lastScore()?.servingTeam === 1}>
									<img
										class="shuttle-indicator"
										src="/view/shuttle.svg"
										alt="サーブ"
									/>
								</Show>
								<Show
									when={changed() === 1}
									fallback={<strong>{lastScore()?.team1 ?? 0}</strong>}
								>
									<span class="score-updated">
										<strong>{lastScore()?.team1 ?? 0}</strong>
									</span>
								</Show>
							</div>
							<span class="score-separator">-</span>
							<div class="score-side score-team-2">
								<Show
									when={changed() === 2}
									fallback={<strong>{lastScore()?.team2 ?? 0}</strong>}
								>
									<span class="score-updated">
										<strong>{lastScore()?.team2 ?? 0}</strong>
									</span>
								</Show>
								<Show when={lastScore()?.servingTeam === 2}>
									<img
										class="shuttle-indicator"
										src="/view/shuttle.svg"
										alt="サーブ"
									/>
								</Show>
							</div>
						</div>
					</Show>
				</div>

				<TeamBlock team={props.match.teams[1]} side="right" />
			</div>

			{/* Game scores */}
			<Show when={scores()?.length > 0}>
				<div class="game-scores">
					<For each={scores()}>
						{(gs) => (
							<div class="game-score">
								<span>SET {gs.game}</span>
								<strong>
									{gs.team1} - {gs.team2}
								</strong>
							</div>
						)}
					</For>
				</div>
			</Show>

			{/* H2H */}
			<Show when={props.match.h2h}>
				<div class="h2h">
					<div class="h2h-scoreline">
						<span>対戦成績</span>
						<strong>
							{props.match.h2h?.team1Wins ?? 0}勝 -{" "}
							{props.match.h2h?.team2Wins ?? 0}勝
						</strong>
					</div>
					<Show when={props.match.h2h?.previous}>
						<div class="previous-meeting">
							<div class="previous-detail">
								前回対戦:{" "}
								{formatTournamentDate(props.match.h2h?.previous?.date)}{" "}
								{props.match.h2h?.previous?.tournament}
							</div>
							<div class="previous-winner">
								{props.match.h2h?.previous?.winner === 1
									? teamLabel(props.match.teams[0])
									: teamLabel(props.match.teams[1])}
								{" 勝利"}
							</div>
							<div class="previous-scoreline">
								{previousGameScoreline(props.match.h2h?.previous?.games)}
							</div>
						</div>
					</Show>
				</div>
			</Show>

			{/* Actions */}
			<div class="match-actions">
				<Show when={props.match.youtubeUrl}>
					<a
						class="youtube-link"
						href={youtubeLink(props.match.youtubeUrl)}
						target="_blank"
						rel="noopener noreferrer"
					>
						配信を見る
						<span class="external-mark" aria-hidden="true">
							↗
						</span>
					</a>
				</Show>

				<Show when={props.match.eventType === "scheduled"}>
					<div class="match-notification-control">
						<span>試合開始を通知</span>
						<label class="switch">
							<span class="visually-hidden">通知設定</span>
							<input
								type="checkbox"
								checked={props.notificationEnabled}
								disabled={props.notificationDisabled}
								onChange={(e) =>
									props.onNotificationChange(props.match.id, e.target.checked)
								}
							/>
							<span class="switch-track" aria-hidden="true" />
						</label>
					</div>
				</Show>
			</div>
		</div>
	);
}
