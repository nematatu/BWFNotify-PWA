import {
	CalendarDays,
	ChevronLeft,
	ChevronRight,
	List,
	SquareArrowOutUpRight,
	X,
} from "lucide-solid";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import type { UpcomingTournament } from "../../type";
import {
	type CalendarMonth,
	type CalendarWeek,
	calendarMonths,
	initialMonthIndex,
	upcomingMonthGroups,
} from "../lib/calendar";
import {
	formatScheduleDate,
	formatTournamentDate,
	japanDateKey,
	WEEKDAY_LABELS,
} from "../lib/format";
import { upcomingTournaments } from "../lib/matchesState";
import { EmptyState } from "./EmptyState";

type ScheduleView = "list" | "calendar";

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
	const months = createMemo(() =>
		calendarMonths(upcomingTournaments(), japanDateKey()),
	);
	const listGroups = createMemo(() =>
		upcomingMonthGroups(upcomingTournaments(), japanDateKey()),
	);
	// 大会データの初回取得後に一度だけ、表示する月を今月へ合わせる。
	let monthInitialized = false;
	createEffect(() => {
		if (monthInitialized || months().length === 0) return;
		setVisibleMonthIndex(initialMonthIndex(months(), japanDateKey()));
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
				fallback={
					<EmptyState class="data-empty" message="今後の大会はありません" />
				}
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
				<Show when={props.tournament.grade}>
					<p class="upcoming-grade">{props.tournament.grade}</p>
				</Show>
				<h4>{props.tournament.name}</h4>
				<TournamentPeriod
					class="upcoming-period"
					startDate={props.tournament.startDate}
					endDate={props.tournament.endDate}
				/>
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
						<TournamentPeriod
							class="tournament-overlay-date"
							startDate={tournament().startDate}
							endDate={tournament().endDate}
						/>
						<TournamentLinks tournament={tournament()} />
					</div>
				)}
			</Show>
		</div>
	);
}

function TournamentPeriod(props: {
	class: string;
	startDate: string;
	endDate: string;
}) {
	return (
		<p class={props.class}>
			<CalendarDays aria-hidden="true" />
			<span class="tournament-period-content">
				<span class="tournament-period-label">開催期間</span>
				<span class="tournament-period-dates">
					<time datetime={props.startDate}>
						{formatScheduleDate(props.startDate)}
					</time>
					{/* 「〜」だけが行末に残らないよう、終了日と一緒に折り返す */}
					<span class="tournament-period-end">
						<span aria-hidden="true">〜</span>
						<time datetime={props.endDate}>
							{formatScheduleDate(props.endDate)}
						</time>
					</span>
				</span>
			</span>
		</p>
	);
}

function TournamentLinks(props: {
	tournament: UpcomingTournament;
	compact?: boolean;
}) {
	return (
		<nav
			class="tournament-links"
			classList={{ compact: props.compact }}
			aria-label={`${props.tournament.name}の資料`}
		>
			<Show when={props.tournament.bwfUrl}>
				{(url) => (
					<ExternalSourceLink
						href={url()}
						icon="/view/sources/bwf.svg"
						label="BWF大会ページ"
						ariaLabel={`${props.tournament.name}をBWFで開く`}
					/>
				)}
			</Show>
			<Show when={props.tournament.bajUrl}>
				{(url) => (
					<ExternalSourceLink
						href={url()}
						icon="/view/sources/baj.svg"
						label="日本バドミントン協会"
						ariaLabel={`${props.tournament.name}を日本バドミントン協会で確認する`}
					/>
				)}
			</Show>
		</nav>
	);
}

function ExternalSourceLink(props: {
	href: string;
	icon: string;
	label: string;
	ariaLabel: string;
}) {
	return (
		<a
			href={props.href}
			target="_blank"
			rel="noreferrer"
			aria-label={props.ariaLabel}
			title={props.label}
		>
			<img src={props.icon} alt="" aria-hidden="true" />
			<SquareArrowOutUpRight class="external-link-mark" aria-hidden="true" />
			<span class="visually-hidden">{props.label}</span>
		</a>
	);
}

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
					<For each={WEEKDAY_LABELS}>{(weekday) => <span>{weekday}</span>}</For>
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
						class="calendar-day"
						classList={{
							"outside-month": !day.inMonth,
							active: day.active,
							today: day.today,
						}}
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
						class={`calendar-event calendar-color-${segment.color}`}
						classList={{ "has-links": segment.showLinks }}
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
