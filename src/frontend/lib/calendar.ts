import type { UpcomingTournament } from "../../type";

/** 日付はすべて `YYYY-MM-DD` の文字列で扱い、文字列比較で前後を判定する。 */

export type CalendarDay = {
	date: string;
	day: number;
	inMonth: boolean;
	active: boolean;
	today: boolean;
};

/** 1週間の行に描く大会の帯。 */
export type CalendarSegment = {
	tournament: UpcomingTournament;
	/** 1（日曜）〜7（土曜） */
	startColumn: number;
	span: number;
	/** 重なった大会を縦にずらすための段番号 */
	lane: number;
	color: number;
	/** 外部リンクを出す帯か（大会ごとに1つ。placeTournamentLinks で決める） */
	showLinks: boolean;
};

/** 外部リンク（ロゴ）を帯に出す最小の日数。これより短い帯は大会名だけを出す */
const MIN_SPAN_FOR_LINKS = 3;

export type CalendarWeek = {
	key: string;
	days: CalendarDay[];
	segments: CalendarSegment[];
	laneCount: number;
};

export type CalendarMonth = {
	key: string;
	label: string;
	weeks: CalendarWeek[];
};

export type UpcomingMonthGroup = {
	key: string;
	year: number;
	month: number;
	tournaments: UpcomingTournament[];
};

const EVENT_COLOR_COUNT = 4;
const DAY_MS = 86_400_000;

/** 大会が1日でも含まれる月を、古い順にカレンダー表示用へ変換する。 */
export function calendarMonths(
	tournaments: UpcomingTournament[],
	today: string,
): CalendarMonth[] {
	return monthKeysOf(tournaments).map((key) => {
		const [year, month] = key.split("-").map(Number);
		const monthStart = `${key}-01`;
		const monthEnd = dateKey(new Date(Date.UTC(year, month, 0)));
		const monthTournaments = tournaments.filter(
			(tournament) =>
				tournament.startDate <= monthEnd && tournament.endDate >= monthStart,
		);
		return {
			key,
			label: `${year}年${month}月`,
			weeks: monthWeeks(year, month, monthTournaments, today),
		};
	});
}

/** 終了していない大会を開始月ごとにまとめる。 */
export function upcomingMonthGroups(
	tournaments: UpcomingTournament[],
	today: string,
): UpcomingMonthGroup[] {
	const groups = new Map<string, UpcomingTournament[]>();
	for (const tournament of tournaments) {
		if (tournament.endDate < today) continue;
		const key = tournament.startDate.slice(0, 7);
		groups.set(key, [...(groups.get(key) || []), tournament]);
	}
	return [...groups.entries()].sort().map(([key, values]) => {
		const [year, month] = key.split("-").map(Number);
		return { key, year, month, tournaments: sortedByStartDate(values) };
	});
}

/** 今月、なければ次に大会がある月を初期表示にする。 */
export function initialMonthIndex(
	months: CalendarMonth[],
	today: string,
): number {
	const currentMonth = today.slice(0, 7);
	const currentIndex = months.findIndex((month) => month.key === currentMonth);
	if (currentIndex >= 0) return currentIndex;
	return Math.max(
		0,
		months.findIndex((month) => month.key > currentMonth),
	);
}

function monthKeysOf(tournaments: UpcomingTournament[]): string[] {
	const keys = new Set<string>();
	for (const tournament of tournaments) {
		let cursor = parseDate(tournament.startDate);
		const end = parseDate(tournament.endDate);
		while (cursor <= end) {
			keys.add(dateKey(cursor).slice(0, 7));
			cursor = new Date(
				Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1),
			);
		}
	}
	return [...keys].sort();
}

/** 月の1日を含む週の日曜から、末日を含む週の土曜までを週ごとに作る。 */
function monthWeeks(
	year: number,
	month: number,
	tournaments: UpcomingTournament[],
	today: string,
): CalendarWeek[] {
	const monthKey = `${year}-${String(month).padStart(2, "0")}`;
	const firstDay = new Date(Date.UTC(year, month - 1, 1));
	const lastDay = new Date(Date.UTC(year, month, 0));
	const calendarStart = addDays(firstDay, -firstDay.getUTCDay());
	const calendarEnd = addDays(lastDay, 6 - lastDay.getUTCDay());
	const lanes = tournamentLanes(tournaments);
	const weeks: CalendarWeek[] = [];

	for (
		let weekStart = calendarStart;
		weekStart <= calendarEnd;
		weekStart = addDays(weekStart, 7)
	) {
		const weekStartKey = dateKey(weekStart);
		const weekEndKey = dateKey(addDays(weekStart, 6));
		const segments = tournaments
			.filter(
				(tournament) =>
					tournament.endDate >= weekStartKey &&
					tournament.startDate <= weekEndKey,
			)
			.map((tournament): CalendarSegment => {
				const start = maxDate(tournament.startDate, weekStartKey);
				const end = minDate(tournament.endDate, weekEndKey);
				return {
					tournament,
					startColumn: parseDate(start).getUTCDay() + 1,
					span: daysBetween(start, end) + 1,
					lane: lanes.get(tournament.id) || 0,
					color: eventColor(tournament.id),
					// どの帯に出すかは、すべての週を作った後で決める（placeTournamentLinks）
					showLinks: false,
				};
			});
		const days = Array.from({ length: 7 }, (_, offset): CalendarDay => {
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
		});
		weeks.push({
			key: weekStartKey,
			days,
			segments,
			laneCount: Math.max(0, ...segments.map((segment) => segment.lane + 1)),
		});
	}
	placeTournamentLinks(weeks);
	return weeks;
}

/**
 * 外部リンク（ロゴ）は、大会ごとに1つの帯にだけ出す。
 * 基本は最後の帯だが、週の始まりにはみ出しただけの短い帯ではロゴが大会名に重なって
 * 読めなくなるため、十分に長い帯のうち最後のものに出す。長い帯がなければ出さない
 * （リンクは大会の詳細から開ける）。
 */
function placeTournamentLinks(weeks: CalendarWeek[]) {
	const target = new Map<string, CalendarSegment>();
	for (const week of weeks) {
		for (const segment of week.segments) {
			if (segment.span >= MIN_SPAN_FOR_LINKS) {
				target.set(segment.tournament.id, segment);
			}
		}
	}
	for (const segment of target.values()) segment.showLinks = true;
}

/** 期間が重ならない大会を同じ段へ詰め、重なる大会は下の段へ置く。 */
function tournamentLanes(tournaments: UpcomingTournament[]) {
	const laneEnds: string[] = [];
	const lanes = new Map<string, number>();
	for (const tournament of sortedByStartDate(tournaments)) {
		const freeLane = laneEnds.findIndex((end) => end < tournament.startDate);
		const lane = freeLane === -1 ? laneEnds.length : freeLane;
		laneEnds[lane] = tournament.endDate;
		lanes.set(tournament.id, lane);
	}
	return lanes;
}

/** 大会IDから決まる色番号。月をまたいでも同じ大会は同じ色になる。 */
function eventColor(id: string) {
	const sum = [...id].reduce((total, char) => total + char.charCodeAt(0), 0);
	return sum % EVENT_COLOR_COUNT;
}

function sortedByStartDate(tournaments: UpcomingTournament[]) {
	return [...tournaments].sort((left, right) =>
		left.startDate.localeCompare(right.startDate),
	);
}

function isTournamentDay(tournament: UpcomingTournament, date: string) {
	return tournament.startDate <= date && tournament.endDate >= date;
}

function parseDate(value: string) {
	return new Date(`${value}T00:00:00Z`);
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
		(parseDate(end).getTime() - parseDate(start).getTime()) / DAY_MS,
	);
}

function maxDate(left: string, right: string) {
	return left > right ? left : right;
}

function minDate(left: string, right: string) {
	return left < right ? left : right;
}
