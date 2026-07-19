import { createMemo, For, Show } from "solid-js";
import type {
	MatchPlayerSummary,
	MatchSummary,
	MatchTeamSummary,
} from "../../type";
import {
	displayCourt,
	displayRound,
	displayTournamentCategory,
	formatMatchTime,
	formatTournamentDate,
	playerInitial,
	previousGameScoreline,
	proxiedImageUrl,
	type SortOrder,
	sortedMatches,
	teamLabel,
	tournamentGroups,
	youtubeLink,
} from "../lib/utils";

// ==========================================
// 1. TeamBlock Component
// ==========================================
export function TeamBlock(props: {
	team: MatchTeamSummary | undefined;
	side: "left" | "right";
}) {
	const isJapanese = () => props.team?.players?.some((p) => p.isJapanese);

	return (
		<div
			class={`team team-${props.side} ${isJapanese() ? "japanese-team" : "foreign-team"}`}
		>
			<div class="team-identity">
				<Show
					when={props.team?.flagUrl}
					fallback={<div class="country-flag-fallback" />}
				>
					<img
						class="country-flag"
						src={proxiedImageUrl(props.team?.flagUrl)}
						alt={props.team?.countryCode || "国旗"}
					/>
				</Show>
				<div class="player-photos">
					<For each={props.team?.players || []}>
						{(player: MatchPlayerSummary) => (
							<Show
								when={player.photoUrl}
								fallback={
									<div class="player-photo player-photo-placeholder">
										{playerInitial(player.name)}
									</div>
								}
							>
								<img
									class="player-photo"
									src={proxiedImageUrl(player.photoUrl)}
									alt={player.name}
								/>
							</Show>
						)}
					</For>
				</div>
			</div>
			<div class="player-names">
				<For each={props.team?.players || []}>
					{(player: MatchPlayerSummary, index) => (
						<>
							<Show when={index() > 0}>
								<span class="player-separator"> / </span>
							</Show>
							<span
								class={`player-name ${player.isJapanese ? "japanese-player" : ""}`}
							>
								{player.name}
							</span>
						</>
					)}
				</For>
			</div>
		</div>
	);
}

// ==========================================
// 2. MatchToolbar Component
// ==========================================
export function MatchToolbar(props: {
	view: "live" | "scheduled";
	liveCount: number;
	scheduledCount: number;
	sortOrder: SortOrder;
	onViewChange: (view: "live" | "scheduled") => void;
	onSortChange: (order: SortOrder) => void;
	onRefresh: () => void;
}) {
	return (
		<div class="match-toolbar">
			<div class="match-tabs" role="tablist" aria-label="試合状態">
				<button
					id="live-tab"
					class="match-tab"
					type="button"
					role="tab"
					aria-selected={props.view === "live" ? "true" : "false"}
					onClick={() => props.onViewChange("live")}
				>
					ライブ <span id="live-count">{props.liveCount}</span>
				</button>
				<button
					id="scheduled-tab"
					class="match-tab"
					type="button"
					role="tab"
					aria-selected={props.view === "scheduled" ? "true" : "false"}
					onClick={() => props.onViewChange("scheduled")}
				>
					このあと <span id="scheduled-count">{props.scheduledCount}</span>
				</button>
			</div>
			<div class="match-controls">
				<label class="visually-hidden" for="sort-order">
					ソート順
				</label>
				<select
					id="sort-order"
					aria-label="ソート順"
					value={props.sortOrder}
					onChange={(e) => props.onSortChange(e.target.value as SortOrder)}
				>
					<option value="time-asc">時間が早い順</option>
					<option value="time-desc">時間が遅い順</option>
					<option value="tournament">大会名順</option>
				</select>
				<button id="refresh-button" type="button" onClick={props.onRefresh}>
					再読み込み
				</button>
			</div>
		</div>
	);
}

// ==========================================
// 3. MatchCard Component
// ==========================================
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

// ==========================================
// 4. MatchList Component
// ==========================================
export function MatchList(props: {
	matches: MatchSummary[];
	sortOrder: SortOrder;
	view: "live" | "scheduled";
	excludedMatchIds: Set<string>;
	notificationDisabled: boolean;
	onNotificationChange: (matchId: string, enabled: boolean) => void;
}) {
	const sorted = createMemo(() =>
		sortedMatches(props.matches, props.sortOrder),
	);
	const grouped = createMemo(() => tournamentGroups(props.matches));
	const isTournamentView = () => props.sortOrder === "tournament";

	return (
		<div
			id="match-list"
			class={`match-list ${isTournamentView() ? "" : "time-grid"}`}
			role="tabpanel"
			aria-labelledby={`${props.view}-tab`}
			aria-live="polite"
		>
			<Show
				when={props.matches.length > 0}
				fallback={<p class="empty-state">対象の試合はありません</p>}
			>
				<Show
					when={isTournamentView()}
					fallback={
						<For each={sorted()}>
							{(match) => (
								<MatchCard
									match={match}
									showTournament={true}
									notificationEnabled={!props.excludedMatchIds.has(match.id)}
									notificationDisabled={props.notificationDisabled}
									onNotificationChange={props.onNotificationChange}
								/>
							)}
						</For>
					}
				>
					<For each={grouped()}>
						{(group) => (
							<div class="tournament-group">
								<div class="tournament-hero">
									<Show
										when={group.matches[0]?.tournamentHeaderImageUrl}
										fallback={
											<div class="tournament-hero-fallback">{group.name}</div>
										}
									>
										<img
											class="tournament-hero-image"
											src={proxiedImageUrl(
												group.matches[0].tournamentHeaderImageUrl,
											)}
											alt={group.name}
										/>
									</Show>
									<div class="tournament-hero-overlay">
										<h2>{group.name}</h2>
										<Show when={group.matches[0]?.tournamentCategory}>
											<p class="tournament-category">
												{group.matches[0].tournamentCategory}
											</p>
										</Show>
									</div>
								</div>
								<div class="tournament-matches">
									<For each={group.matches}>
										{(match) => (
											<MatchCard
												match={match}
												notificationEnabled={
													!props.excludedMatchIds.has(match.id)
												}
												notificationDisabled={props.notificationDisabled}
												onNotificationChange={props.onNotificationChange}
											/>
										)}
									</For>
								</div>
							</div>
						)}
					</For>
				</Show>
			</Show>
		</div>
	);
}
