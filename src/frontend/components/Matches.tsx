import {
	ArrowDownWideNarrow,
	Check,
	ChevronDown,
	RefreshCw,
} from "lucide-solid";
import {
	createMemo,
	createSignal,
	For,
	onCleanup,
	onMount,
	Show,
} from "solid-js";
import type { MatchSummary, MatchTeamSummary } from "../../type";
import {
	displayCourt,
	displayRound,
	formatMatchTime,
	formatTournamentDate,
	playerInitial,
	previousGameScoreline,
	teamLabel,
} from "../lib/format";
import {
	currentView,
	loadStatus,
	type MainView,
	matches,
	recentResults,
	setCurrentView,
	setSortOrder,
	sortOrder,
	upcomingTournaments,
} from "../lib/matchesState";
import {
	type LiveMatch,
	type SortOrder,
	sortedMatches,
	tournamentGroups,
} from "../lib/matchList";
import { proxiedImageUrl } from "../lib/media";
import {
	excludedIds,
	notificationDisabled,
	updateMatchNotif,
} from "../lib/pushNotificationState";

// --- ツールバー ---

const countMatches = (eventType: MatchSummary["eventType"]) =>
	matches().filter((match) => match.eventType === eventType).length;

const VIEW_TABS: Array<{
	view: MainView;
	label: string;
	countId?: string;
	count: () => number;
}> = [
	{
		view: "live",
		label: "ライブ",
		countId: "live-count",
		count: () => countMatches("live"),
	},
	{
		view: "scheduled",
		label: "このあと",
		countId: "scheduled-count",
		count: () => countMatches("scheduled"),
	},
	{ view: "results", label: "結果", count: () => recentResults().length },
	{
		view: "upcoming",
		label: "大会",
		count: () => upcomingTournaments().length,
	},
];

export function MatchToolbar() {
	const isMatchView = () =>
		currentView() === "live" || currentView() === "scheduled";

	return (
		<>
			<div class="match-toolbar">
				<div class="match-tabs" role="tablist" aria-label="試合状態">
					<For each={VIEW_TABS}>
						{(tab) => (
							<button
								id={`${tab.view}-tab`}
								class="match-tab"
								type="button"
								role="tab"
								aria-selected={currentView() === tab.view ? "true" : "false"}
								onClick={() => setCurrentView(tab.view)}
							>
								{tab.label} <span id={tab.countId}>{tab.count()}</span>
							</button>
						)}
					</For>
				</div>
				<div class="match-controls">
					<button
						id="refresh-button"
						type="button"
						aria-label="再読み込み"
						title="再読み込み"
						onClick={loadStatus}
					>
						<RefreshCw size={17} aria-hidden="true" />
					</button>
				</div>
			</div>
			<Show when={isMatchView()}>
				<div class="match-sort-toolbar">
					<SortControl />
				</div>
			</Show>
		</>
	);
}

const SORT_LABELS: Array<{ value: SortOrder; label: string }> = [
	{ value: "time-asc", label: "時間が早い順" },
	{ value: "time-desc", label: "時間が遅い順" },
	{ value: "tournament", label: "大会名順" },
];

function SortControl() {
	const [open, setOpen] = createSignal(false);
	let root: HTMLDivElement | undefined;
	const selectedLabel = () =>
		SORT_LABELS.find((option) => option.value === sortOrder())?.label || "";
	const closeOnEscape = (event: KeyboardEvent) => {
		if (event.key === "Escape") setOpen(false);
	};

	onMount(() => {
		const closeOnOutsideClick = (event: PointerEvent) => {
			if (!root?.contains(event.target as Node)) setOpen(false);
		};
		document.addEventListener("pointerdown", closeOnOutsideClick);
		onCleanup(() =>
			document.removeEventListener("pointerdown", closeOnOutsideClick),
		);
	});

	return (
		<div ref={root} class="sort-select">
			<button
				type="button"
				class="sort-select-button"
				aria-label={`ソート順: ${selectedLabel()}`}
				aria-haspopup="listbox"
				aria-expanded={open()}
				onClick={() => setOpen((value) => !value)}
				onKeyDown={closeOnEscape}
			>
				<ArrowDownWideNarrow size={17} aria-hidden="true" />
				<span>{selectedLabel()}</span>
				<ChevronDown
					class={open() ? "is-open" : ""}
					size={16}
					aria-hidden="true"
				/>
			</button>
			<Show when={open()}>
				<div
					class="sort-options"
					role="listbox"
					aria-label="ソート順"
					onKeyDown={closeOnEscape}
				>
					<For each={SORT_LABELS}>
						{(option) => (
							<button
								type="button"
								class="sort-option"
								role="option"
								aria-selected={sortOrder() === option.value}
								onClick={() => {
									setSortOrder(option.value);
									setOpen(false);
								}}
							>
								<span>{option.label}</span>
								<Show when={sortOrder() === option.value}>
									<Check size={16} aria-hidden="true" />
								</Show>
							</button>
						)}
					</For>
				</div>
			</Show>
		</div>
	);
}

// --- 試合一覧 ---

export function MatchList() {
	const visibleMatches = createMemo(() =>
		matches().filter((match) => match.eventType === currentView()),
	);
	const sorted = createMemo(() => sortedMatches(visibleMatches(), sortOrder()));
	const groups = createMemo(() => tournamentGroups(visibleMatches()));
	const isTournamentOrder = () => sortOrder() === "tournament";

	return (
		<div
			id="match-list"
			class={`match-list ${isTournamentOrder() ? "" : "time-grid"}`}
			role="tabpanel"
			aria-labelledby={`${currentView()}-tab`}
			aria-live="polite"
		>
			<Show
				when={visibleMatches().length > 0}
				fallback={<p class="empty-state">対象の試合はありません</p>}
			>
				<Show
					when={isTournamentOrder()}
					fallback={
						<For each={sorted()}>
							{(match) => <MatchCard match={match} showTournament={true} />}
						</For>
					}
				>
					<For each={groups()}>
						{(group) => (
							<div class="tournament-group">
								<TournamentHeading
									name={group.name}
									logoUrl={group.matches[0]?.tournamentLogoUrl}
									category={group.matches[0]?.tournamentCategory}
								/>
								<div class="tournament-matches">
									<For each={group.matches}>
										{(match) => <MatchCard match={match} />}
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

function TournamentHeading(props: {
	name: string;
	logoUrl?: string;
	category?: string;
}) {
	return (
		<div class="tournament-heading">
			<Show
				when={props.logoUrl}
				fallback={<div class="tournament-logo-fallback">BWF</div>}
			>
				<img
					class="tournament-logo"
					loading="lazy"
					decoding="async"
					src={proxiedImageUrl(props.logoUrl, "logo")}
					alt={props.name}
				/>
			</Show>
			<div class="tournament-heading-text">
				<h2>{props.name}</h2>
				<Show when={props.category}>
					<p class="tournament-category">{props.category}</p>
				</Show>
			</div>
		</div>
	);
}

// --- 試合カード ---

export function MatchCard(props: {
	match: LiveMatch;
	showTournament?: boolean;
}) {
	const scores = () => props.match.scores;
	const isLive = () => props.match.eventType === "live";

	return (
		<div class={`match ${isLive() ? "live-match" : "scheduled-match"}`}>
			<div class="match-primary-row">
				<div class="match-state">
					<Show
						when={isLive()}
						fallback={
							<time class="match-time" dateTime={props.match.startTime}>
								{formatMatchTime(props.match.startTime)}
							</time>
						}
					>
						<span class="live-state">ライブ中</span>
					</Show>
				</div>
				<div class="match-actions">
					{/* 開始済みの試合には通知トグルを出さない */}
					<Show when={props.match.eventType === "scheduled"}>
						<MatchNotificationToggle matchId={props.match.id} />
					</Show>
				</div>
			</div>

			<div class="match-header">
				<Show when={props.showTournament}>
					<div class="match-tournament">
						<Show
							when={props.match.tournamentLogoUrl}
							fallback={<div class="match-tournament-logo-fallback">BWF</div>}
						>
							<img
								class="match-tournament-logo"
								loading="lazy"
								decoding="async"
								src={proxiedImageUrl(props.match.tournamentLogoUrl, "logo")}
								alt=""
							/>
						</Show>
						<h3>{props.match.tournament}</h3>
					</div>
				</Show>
				<div class="match-meta">
					<Show when={props.match.round}>
						<span class="match-round">{displayRound(props.match.round)}</span>
					</Show>
					<Show when={props.match.court}>
						<span class="match-court">{displayCourt(props.match.court)}</span>
					</Show>
				</div>
			</div>

			<div class="matchup">
				<TeamBlock team={props.match.teams[0]} side="left" />
				<div class="match-centre">
					<Show
						when={isLive() && scores()?.length > 0}
						fallback={<span class="versus">vs</span>}
					>
						<CurrentScore match={props.match} />
					</Show>
				</div>
				<TeamBlock team={props.match.teams[1]} side="right" />
			</div>

			<Show when={scores()?.length > 0}>
				<div class="game-scores">
					<For each={scores()}>
						{(game) => (
							<div class="game-score">
								<span>第{game.game}ゲーム</span>
								<strong>
									{game.team1} - {game.team2}
								</strong>
							</div>
						)}
					</For>
				</div>
			</Show>

			<Show when={props.match.h2h}>
				<HeadToHead match={props.match} />
			</Show>
		</div>
	);
}

function MatchNotificationToggle(props: { matchId: string }) {
	return (
		<div class="match-notification-control">
			<span>開始通知</span>
			<label class="switch">
				<span class="visually-hidden">通知設定</span>
				<input
					type="checkbox"
					checked={!excludedIds().has(props.matchId)}
					disabled={notificationDisabled()}
					onChange={(event) =>
						updateMatchNotif(props.matchId, event.target.checked)
					}
				/>
				<span class="switch-track" aria-hidden="true" />
			</label>
		</div>
	);
}

export function TeamBlock(props: {
	team: MatchTeamSummary | undefined;
	side: "left" | "right";
}) {
	const players = () => props.team?.players || [];
	const isJapanese = () => players().some((player) => player.isJapanese);
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
						loading="lazy"
						decoding="async"
						src={proxiedImageUrl(props.team?.flagUrl, "flag")}
						alt={props.team?.countryCode || "国旗"}
					/>
				</Show>
				<div class="player-photos">
					<For each={players()}>
						{(player) => (
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
									loading="lazy"
									decoding="async"
									src={proxiedImageUrl(player.photoUrl, "photo")}
									alt={player.name}
								/>
							</Show>
						)}
					</For>
				</div>
			</div>
			<div class="player-names">
				<For each={players()}>
					{(player, index) => (
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

/** ライブ中の現在ゲーム得点。サーブ側はシャトルアイコンを外側に表示する。 */
function CurrentScore(props: { match: LiveMatch }) {
	const currentGame = () => props.match.scores.at(-1);
	return (
		<>
			<span class="current-game">第{props.match.scores.length}ゲーム</span>
			<div class="current-score">
				<ScoreSide
					team={1}
					score={currentGame()?.team1}
					serving={currentGame()?.servingTeam === 1}
					changed={props.match.scoreChangedTeam === 1}
				/>
				<span class="score-separator">-</span>
				<ScoreSide
					team={2}
					score={currentGame()?.team2}
					serving={currentGame()?.servingTeam === 2}
					changed={props.match.scoreChangedTeam === 2}
				/>
			</div>
		</>
	);
}

function ScoreSide(props: {
	team: 1 | 2;
	score: number | undefined;
	serving: boolean;
	changed: boolean;
}) {
	return (
		<div class={`score-side score-team-${props.team}`}>
			<Show when={props.team === 1 && props.serving}>
				<ShuttleIcon />
			</Show>
			<Show when={props.changed} fallback={<strong>{props.score ?? 0}</strong>}>
				{/* 得点した側だけを強調アニメーションの対象にする */}
				<span class="score-updated">
					<strong>{props.score ?? 0}</strong>
				</span>
			</Show>
			<Show when={props.team === 2 && props.serving}>
				<ShuttleIcon />
			</Show>
		</div>
	);
}

function ShuttleIcon() {
	return <img class="shuttle-indicator" src="/view/shuttle.svg" alt="サーブ" />;
}

/** H2H（通算成績）と前回対戦。チーム順は現在の日本人先頭順に揃えてある。 */
function HeadToHead(props: { match: MatchSummary }) {
	const h2h = () => props.match.h2h;
	const previous = () => h2h()?.previous;
	const previousWinner = () =>
		teamLabel(props.match.teams[previous()?.winner === 1 ? 0 : 1]);

	return (
		<details class="h2h">
			{/* 勝ち数は、それぞれの選手の真下に置いて誰の成績か分かるようにする */}
			<summary class="h2h-scoreline">
				<strong class="h2h-wins" aria-hidden="true">
					{h2h()?.team1Wins ?? 0}勝
				</strong>
				<span class="h2h-label" aria-hidden="true">
					対戦成績
				</span>
				<strong class="h2h-wins" aria-hidden="true">
					{h2h()?.team2Wins ?? 0}勝
				</strong>
				<span class="visually-hidden">
					対戦成績 {teamLabel(props.match.teams[0])} {h2h()?.team1Wins ?? 0}
					勝、{teamLabel(props.match.teams[1])} {h2h()?.team2Wins ?? 0}勝
				</span>
			</summary>
			<Show when={previous()}>
				<div class="previous-meeting">
					<div class="previous-detail">
						前回対戦: {formatTournamentDate(previous()?.date)}{" "}
						{previous()?.tournament}
					</div>
					<div class="previous-winner">{previousWinner()} 勝利</div>
					<div class="previous-scoreline">
						{previousGameScoreline(previous()?.games)}
					</div>
				</div>
			</Show>
		</details>
	);
}
