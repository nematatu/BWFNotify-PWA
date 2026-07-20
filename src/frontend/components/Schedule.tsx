import {
	CalendarDays,
	ChevronLeft,
	ChevronRight,
	List,
	SquareArrowOutUpRight,
	X,
} from "lucide-solid";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import type {
	MatchSummary,
	MatchTeamSummary,
	UpcomingTournament,
} from "../../type";
import { recentResults, upcomingTournaments } from "../lib/matchesState";
import { orderedResultScores, resultView } from "../lib/resultView";
import {
	displayRound,
	formatTournamentDate,
	japanDateKey,
	proxiedImageUrl,
} from "../lib/utils";

type ScheduleView = "list" | "calendar";

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
	const view = () => resultView(props.match);
	const leftTeam = () => props.match.teams[view().leftIndex - 1];
	const rightTeam = () => props.match.teams[view().rightIndex - 1];
	const resultClass = () =>
		view().outcome === "win"
			? "result-win"
			: view().outcome === "loss"
				? "result-loss"
				: view().outcome === "japanese-match"
					? "result-japanese-match"
					: "result-unknown";
	const outcomeLabel = () =>
		view().outcome === "win"
			? "WIN"
			: view().outcome === "loss"
				? "LOSE"
				: view().outcome === "japanese-match"
					? "日本人対決"
					: "結果未確定";
	return (
		<article class={`result-row ${resultClass()}`}>
			<div class="result-header">
				<span class="result-outcome">{outcomeLabel()}</span>
				<div class="result-meta">
					<span class="result-tournament">{props.match.tournament}</span>
					<Show when={props.match.round}>
						<span class="result-round">{displayRound(props.match.round)}</span>
					</Show>
					<time datetime={matchDate(props.match)}>
						{formatTournamentDate(matchDate(props.match))}
					</time>
				</div>
			</div>
			<div class="result-matchup">
				<ResultTeam
					team={leftTeam()}
					isJapanese={true}
					teamResult={
						view().kind === "japanese-match"
							? teamResult(view().winner, view().leftIndex)
							: undefined
					}
				/>
				<div class="result-score">
					<span class="visually-hidden">ゲームスコア</span>
					<For each={orderedResultScores(props.match, view().leftIndex)}>
						{(score) => <span>{score}</span>}
					</For>
				</div>
				<ResultTeam
					team={rightTeam()}
					isJapanese={view().kind === "japanese-match"}
					teamResult={
						view().kind === "japanese-match"
							? teamResult(view().winner, view().rightIndex)
							: undefined
					}
				/>
			</div>
		</article>
	);
}

function ResultTeam(props: {
	team: MatchTeamSummary | undefined;
	isJapanese: boolean;
	teamResult?: "WIN" | "LOSE" | "未確定";
}) {
	return (
		<div class={`result-team ${props.isJapanese ? "result-team-japan" : ""}`}>
			<div class="result-player-photos">
				<For
					each={props.team?.players.filter((player) => player.photoUrl) || []}
				>
					{(player) => (
						<img
							class="result-player-photo"
							src={proxiedImageUrl(player.photoUrl)}
							alt={`${player.name}選手`}
						/>
					)}
				</For>
			</div>
			<div class="result-team-head">
				<Show when={props.team?.flagUrl}>
					<img
						class="result-flag"
						src={proxiedImageUrl(props.team?.flagUrl)}
						alt={props.team?.countryCode || "国旗"}
					/>
				</Show>
				<Show when={props.teamResult}>
					<span class="team-result">{props.teamResult}</span>
				</Show>
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
	const [scheduleView, setScheduleView] = createSignal<ScheduleView>("list");
	const [visibleMonthIndex, setVisibleMonthIndex] = createSignal(0);
	const [selectedTournament, setSelectedTournament] =
		createSignal<UpcomingTournament>();
	let popover: HTMLDivElement | undefined;
	const selectTournament = (tournament: UpcomingTournament) => {
		setSelectedTournament(tournament);
		queueMicrotask(() => popover?.showPopover());
	};
	const months = createMemo(() => calendarMonths(upcomingTournaments()));
	const listGroups = createMemo(() =>
		upcomingListGroups(upcomingTournaments(), japanDateKey()),
	);
	let monthInitialized = false;
	createEffect(() => {
		if (monthInitialized || months().length === 0) return;
		const currentMonth = japanDateKey().slice(0, 7);
		const currentIndex = months().findIndex(
			(month) => month.key === currentMonth,
		);
		const nextIndex = months().findIndex((month) => month.key > currentMonth);
		setVisibleMonthIndex(
			currentIndex >= 0 ? currentIndex : Math.max(0, nextIndex),
		);
		monthInitialized = true;
	});
	const visibleMonth = () =>
		months()[Math.min(visibleMonthIndex(), Math.max(0, months().length - 1))];

	return (
		<section
			class="data-section tab-data-section"
			aria-labelledby="upcoming-tab"
			role="tabpanel"
		>
			<div class="data-section-heading schedule-heading">
				<h2 id="schedule-heading">今後の大会</h2>
				<fieldset class="schedule-view-switch">
					<legend class="visually-hidden">大会予定の表示形式</legend>
					<button
						type="button"
						aria-pressed={scheduleView() === "list"}
						onClick={() => setScheduleView("list")}
					>
						<List size={17} aria-hidden="true" />
						一覧
					</button>
					<button
						type="button"
						aria-pressed={scheduleView() === "calendar"}
						onClick={() => setScheduleView("calendar")}
					>
						<CalendarDays size={17} aria-hidden="true" />
						カレンダー
					</button>
				</fieldset>
			</div>
			<Show
				when={upcomingTournaments().length > 0}
				fallback={<p class="data-empty">今後の大会はありません</p>}
			>
				<Show
					when={scheduleView() === "list"}
					fallback={
						<div class="calendar-list">
							<Show when={visibleMonth()}>
								{(month) => (
									<TournamentCalendar
										month={month()}
										hasPrevious={visibleMonthIndex() > 0}
										hasNext={visibleMonthIndex() < months().length - 1}
										onPrevious={() =>
											setVisibleMonthIndex((index) => Math.max(0, index - 1))
										}
										onNext={() =>
											setVisibleMonthIndex((index) =>
												Math.min(months().length - 1, index + 1),
											)
										}
										onSelect={selectTournament}
									/>
								)}
							</Show>
						</div>
					}
				>
					<Show
						when={listGroups().length > 0}
						fallback={<p class="data-empty">今後の大会はありません</p>}
					>
						<div class="upcoming-list">
							<For each={listGroups()}>
								{(group) => (
									<section class="upcoming-month-group">
										<header>
											<strong>{group.month}月</strong>
											<span>{group.year}年</span>
										</header>
										<div class="upcoming-month-events">
											<For each={group.tournaments}>
												{(tournament) => (
													<TournamentRow
														tournament={tournament}
														onSelect={selectTournament}
													/>
												)}
											</For>
										</div>
									</section>
								)}
							</For>
						</div>
					</Show>
				</Show>
			</Show>
			<TournamentOverlay
				ref={(element) => {
					popover = element;
				}}
				tournament={selectedTournament()}
				onClose={() => {
					popover?.hidePopover();
					setSelectedTournament(undefined);
				}}
			/>
		</section>
	);
}

function TournamentRow(props: {
	tournament: UpcomingTournament;
	onSelect: (tournament: UpcomingTournament) => void;
}) {
	return (
		<article class="upcoming-row">
			<Show when={props.tournament.imageUrl}>
				<img
					class="tournament-watermark"
					src={props.tournament.imageUrl}
					alt=""
					aria-hidden="true"
				/>
			</Show>
			<button
				type="button"
				class="upcoming-main"
				onClick={() => props.onSelect(props.tournament)}
				aria-label={`${props.tournament.name}の詳細を表示`}
			>
				<h4>{props.tournament.name}</h4>
				<p class="upcoming-meta">
					<span>
						{formatTournamentDate(props.tournament.startDate)} -{" "}
						{formatTournamentDate(props.tournament.endDate)}
					</span>
					<Show when={props.tournament.grade}>
						<span>{props.tournament.grade}</span>
					</Show>
				</p>
			</button>
			<TournamentLinks tournament={props.tournament} />
		</article>
	);
}

function TournamentOverlay(props: {
	ref: (element: HTMLDivElement) => void;
	tournament?: UpcomingTournament;
	onClose: () => void;
}) {
	return (
		<div
			ref={props.ref}
			popover="auto"
			class="tournament-overlay"
			role="dialog"
			aria-label="大会詳細"
			aria-modal="true"
			onClick={(event) => {
				if (event.target === event.currentTarget) props.onClose();
			}}
			onKeyDown={(event) => {
				if (event.key === "Escape") props.onClose();
			}}
			onToggle={(event) => {
				if (event.newState === "closed") props.onClose();
			}}
		>
			<Show when={props.tournament}>
				{(tournament) => (
					<div class="tournament-overlay-panel">
						<button
							type="button"
							class="tournament-overlay-close"
							onClick={props.onClose}
							aria-label="大会詳細を閉じる"
							title="閉じる"
						>
							<X aria-hidden="true" />
						</button>
						<p class="tournament-overlay-grade">
							{tournament().grade || "大会"}
						</p>
						<h3>{tournament().name}</h3>
						<p class="tournament-overlay-date">
							{formatTournamentDate(tournament().startDate)} -{" "}
							{formatTournamentDate(tournament().endDate)}
						</p>
						<TournamentLinks tournament={tournament()} />
					</div>
				)}
			</Show>
		</div>
	);
}

function TournamentLinks(props: {
	tournament: UpcomingTournament;
	compact?: boolean;
}) {
	return (
		<nav
			class={`tournament-links${props.compact ? " compact" : ""}`}
			aria-label={`${props.tournament.name}の資料`}
		>
			<Show when={props.tournament.bwfUrl}>
				<a
					href={props.tournament.bwfUrl}
					target="_blank"
					rel="noreferrer"
					aria-label={`${props.tournament.name}をBWFで開く`}
					title="BWF大会ページ"
				>
					<img src="/view/sources/bwf.svg" alt="" aria-hidden="true" />
					<SquareArrowOutUpRight
						class="external-link-mark"
						aria-hidden="true"
					/>
					<span class="visually-hidden">BWF大会ページ</span>
				</a>
			</Show>
			<Show when={props.tournament.bajUrl}>
				<a
					href={props.tournament.bajUrl}
					target="_blank"
					rel="noreferrer"
					aria-label={`${props.tournament.name}を日本バドミントン協会で確認する`}
					title="日本バドミントン協会"
				>
					<img src="/view/sources/baj.svg" alt="" aria-hidden="true" />
					<SquareArrowOutUpRight
						class="external-link-mark"
						aria-hidden="true"
					/>
					<span class="visually-hidden">日本バドミントン協会</span>
				</a>
			</Show>
		</nav>
	);
}

type CalendarMonth = {
	key: string;
	label: string;
	weeks: CalendarWeek[];
	tournaments: UpcomingTournament[];
};

type CalendarDay = {
	date: string;
	day: number;
	inMonth: boolean;
	active: boolean;
	today: boolean;
};

type CalendarSegment = {
	tournament: UpcomingTournament;
	startColumn: number;
	span: number;
	lane: number;
	color: number;
	showLinks: boolean;
};

type CalendarWeek = {
	key: string;
	days: CalendarDay[];
	segments: CalendarSegment[];
	laneCount: number;
};

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function TournamentCalendar(props: {
	month: CalendarMonth;
	hasPrevious: boolean;
	hasNext: boolean;
	onPrevious: () => void;
	onNext: () => void;
	onSelect: (tournament: UpcomingTournament) => void;
}) {
	return (
		<section
			class="calendar-month"
			aria-labelledby={`month-${props.month.key}`}
		>
			<header class="calendar-month-header">
				<button
					type="button"
					onClick={props.onPrevious}
					disabled={!props.hasPrevious}
					aria-label="前の月"
					title="前の月"
				>
					<ChevronLeft aria-hidden="true" />
				</button>
				<h3 id={`month-${props.month.key}`}>{props.month.label}</h3>
				<button
					type="button"
					onClick={props.onNext}
					disabled={!props.hasNext}
					aria-label="次の月"
					title="次の月"
				>
					<ChevronRight aria-hidden="true" />
				</button>
			</header>
			<div class="month-calendar">
				<div class="calendar-weekdays" aria-hidden="true">
					<For each={WEEKDAYS}>{(weekday) => <span>{weekday}</span>}</For>
				</div>
				<For each={props.month.weeks}>
					{(week) => <CalendarWeekRow week={week} onSelect={props.onSelect} />}
				</For>
			</div>
		</section>
	);
}

function CalendarWeekRow(props: {
	week: CalendarWeek;
	onSelect: (tournament: UpcomingTournament) => void;
}) {
	const rowCount = () => Math.max(1, props.week.laneCount);
	return (
		<div class="calendar-week" style={{ "--calendar-event-rows": rowCount() }}>
			<For each={props.week.days}>
				{(day, index) => (
					<div
						class={`calendar-day${day.inMonth ? "" : " outside-month"}${day.active ? " active" : ""}${day.today ? " today" : ""}`}
						style={{
							"grid-column": index() + 1,
							"grid-row": `1 / span ${rowCount() + 1}`,
						}}
					>
						<time datetime={day.date}>{day.day}</time>
					</div>
				)}
			</For>
			<For each={props.week.segments}>
				{(segment) => (
					<div
						class={`calendar-event calendar-color-${segment.color}${segment.showLinks ? " has-links" : ""}`}
						style={{
							"grid-column": `${segment.startColumn} / span ${segment.span}`,
							"grid-row": segment.lane + 2,
						}}
						title={`${segment.tournament.name} ${formatTournamentDate(segment.tournament.startDate)} - ${formatTournamentDate(segment.tournament.endDate)}`}
					>
						<Show when={segment.tournament.imageUrl}>
							<img
								class="calendar-event-watermark"
								src={segment.tournament.imageUrl}
								alt=""
								aria-hidden="true"
							/>
						</Show>
						<button
							type="button"
							class="calendar-event-button"
							onClick={() => props.onSelect(segment.tournament)}
							aria-label={`${segment.tournament.name}の詳細を表示`}
						>
							<span class="calendar-event-name">{segment.tournament.name}</span>
						</button>
						<Show when={segment.showLinks}>
							<TournamentLinks tournament={segment.tournament} compact />
						</Show>
					</div>
				)}
			</For>
		</div>
	);
}

function calendarMonths(tournaments: UpcomingTournament[]): CalendarMonth[] {
	const monthKeys = new Set<string>();
	for (const tournament of tournaments) {
		let cursor = new Date(`${tournament.startDate}T00:00:00Z`);
		const end = new Date(`${tournament.endDate}T00:00:00Z`);
		while (cursor <= end) {
			monthKeys.add(cursor.toISOString().slice(0, 7));
			cursor = new Date(
				Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1),
			);
		}
	}

	return [...monthKeys].sort().map((key) => {
		const [year, month] = key.split("-").map(Number);
		const dayCount = new Date(Date.UTC(year, month, 0)).getUTCDate();
		const monthStart = `${key}-01`;
		const monthEnd = `${key}-${String(dayCount).padStart(2, "0")}`;
		const monthTournaments = tournaments.filter(
			(tournament) =>
				tournament.startDate <= monthEnd && tournament.endDate >= monthStart,
		);
		return {
			key,
			year,
			month,
			label: `${year}年${month}月`,
			weeks: monthWeeks(year, month, key, monthTournaments),
			tournaments: monthTournaments,
		};
	});
}

function upcomingListGroups(tournaments: UpcomingTournament[], today: string) {
	const groups = new Map<string, UpcomingTournament[]>();
	for (const tournament of tournaments) {
		if (tournament.endDate < today) continue;
		const key = tournament.startDate.slice(0, 7);
		groups.set(key, [...(groups.get(key) || []), tournament]);
	}
	return [...groups.entries()].sort().map(([key, values]) => {
		const [year, month] = key.split("-").map(Number);
		return {
			key,
			label: `${year}年${month}月`,
			year,
			month,
			tournaments: values.sort((left, right) =>
				left.startDate.localeCompare(right.startDate),
			),
		};
	});
}

function monthWeeks(
	year: number,
	month: number,
	monthKey: string,
	tournaments: UpcomingTournament[],
): CalendarWeek[] {
	const today = japanDateKey();
	const firstDay = new Date(Date.UTC(year, month - 1, 1));
	const lastDay = new Date(Date.UTC(year, month, 0));
	const calendarStart = addDays(firstDay, -firstDay.getUTCDay());
	const calendarEnd = addDays(lastDay, 6 - lastDay.getUTCDay());
	const calendarEndKey = dateKey(calendarEnd);
	const lanes = tournamentLanes(tournaments);
	const weeks: CalendarWeek[] = [];

	for (
		let weekStart = calendarStart;
		weekStart <= calendarEnd;
		weekStart = addDays(weekStart, 7)
	) {
		const weekEnd = addDays(weekStart, 6);
		const weekStartKey = dateKey(weekStart);
		const weekEndKey = dateKey(weekEnd);
		const segments = tournaments.flatMap((tournament) => {
			if (
				tournament.endDate < weekStartKey ||
				tournament.startDate > weekEndKey
			) {
				return [];
			}
			const start = maxDate(tournament.startDate, weekStartKey);
			const end = minDate(tournament.endDate, weekEndKey);
			return [
				{
					tournament,
					startColumn: new Date(`${start}T00:00:00Z`).getUTCDay() + 1,
					span: daysBetween(start, end) + 1,
					lane: lanes.get(tournament.id) || 0,
					color: eventColor(tournament.id),
					showLinks: end === minDate(tournament.endDate, calendarEndKey),
				},
			];
		});
		const laneCount = segments.reduce(
			(max, segment) => Math.max(max, segment.lane + 1),
			0,
		);
		weeks.push({
			key: weekStartKey,
			days: Array.from({ length: 7 }, (_, offset) => {
				const date = dateKey(addDays(weekStart, offset));
				return {
					date,
					day: Number(date.slice(-2)),
					inMonth: date.startsWith(monthKey),
					active: tournaments.some((tournament) =>
						isTournamentDay(tournament, date),
					),
					today: date === today,
				};
			}),
			segments,
			laneCount,
		});
	}
	return weeks;
}

function tournamentLanes(tournaments: UpcomingTournament[]) {
	const laneEnds: string[] = [];
	const lanes = new Map<string, number>();
	for (const tournament of [...tournaments].sort((left, right) =>
		left.startDate.localeCompare(right.startDate),
	)) {
		const freeLane = laneEnds.findIndex((end) => end < tournament.startDate);
		const lane = freeLane === -1 ? laneEnds.length : freeLane;
		laneEnds[lane] = tournament.endDate;
		lanes.set(tournament.id, lane);
	}
	return lanes;
}

function eventColor(id: string) {
	return (
		[...id].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 4
	);
}

function dateKey(date: Date) {
	return date.toISOString().slice(0, 10);
}

function addDays(date: Date, amount: number) {
	return new Date(
		Date.UTC(
			date.getUTCFullYear(),
			date.getUTCMonth(),
			date.getUTCDate() + amount,
		),
	);
}

function daysBetween(start: string, end: string) {
	return Math.round(
		(Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
			86_400_000,
	);
}

function maxDate(left: string, right: string) {
	return left > right ? left : right;
}

function minDate(left: string, right: string) {
	return left < right ? left : right;
}

function isTournamentDay(tournament: UpcomingTournament, date: string) {
	return tournament.startDate <= date && tournament.endDate >= date;
}

function teamResult(winner: 1 | 2 | undefined, team: 1 | 2) {
	return winner ? (winner === team ? "WIN" : "LOSE") : "未確定";
}

function matchDate(match: MatchSummary) {
	return match.tournamentDate || match.startTime?.slice(0, 10);
}
