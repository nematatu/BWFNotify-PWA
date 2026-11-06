import type { DeliveryResult, MatchSummary, PublicState } from "../type";
import { errorMessage, todayJst } from "../utils";
import { fetchJapaneseMatches } from "./bwf";
import { sendPushNotifications } from "./push";
import {
	CALENDAR_GENERATED_AT,
	staticTournamentCalendar,
} from "./tournamentCalendar";

export const STATE_KEY = "push:state";
/** 内容が変わらなくても、この間隔を超えたら状態を書き直す（ハートビート）。 */
export const STATE_MAX_AGE_MS = 30 * 60 * 1000;
/** 全送信が失敗した試合を再送する上限回数。 */
export const MAX_NOTIFICATION_ATTEMPTS = 3;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const HISTORY_REFRESH_INTERVAL_MS = 12 * HOUR_MS;
const HISTORY_UPSTREAM_CACHE_TTL_SECONDS = 12 * 60 * 60;
const HISTORY_DAYS = 7;
const RECENT_RESULTS_MAX_AGE_MS = 7 * DAY_MS;
const NOTIFICATION_DEDUP_AGE_MS = 30 * DAY_MS;

export type StoredState = PublicState & {
	/** 旧バージョンで使っていた履歴取得時刻。historyCheckedAtへ移行済み。 */
	calendarAttemptedAt?: string;
	historyCheckedAt?: string;
	/** 試合ID -> 全送信が失敗した回数 */
	notificationAttempts?: Record<string, number>;
	/** 試合ID -> 通知済みにした時刻 */
	notifiedLiveMatches?: Record<string, string>;
};

type NotificationCheckDependencies = {
	fetchMatches: (
		cache: KVNamespace,
		knownMatches: MatchSummary[],
	) => Promise<MatchSummary[]>;
	fetchHistory: (
		cache: KVNamespace,
		knownMatches: MatchSummary[],
		now: Date,
	) => Promise<MatchSummary[]>;
	sendNotifications: (
		env: Env,
		matches: MatchSummary[],
	) => Promise<DeliveryResult>;
	now: () => Date;
};

export type NotificationCheckResult = DeliveryResult & {
	liveMatches: number;
	scheduledMatches: number;
	newMatches: number;
	stateWritten: boolean;
};

const defaultDependencies: NotificationCheckDependencies = {
	fetchMatches: fetchJapaneseMatches,
	fetchHistory: (cache, knownMatches, now) =>
		fetchJapaneseMatches(cache, knownMatches, {
			upstreamCacheTtlSeconds: HISTORY_UPSTREAM_CACHE_TTL_SECONDS,
			enrichHeadToHead: false,
			dates: recentDates(todayJst(now), HISTORY_DAYS),
		}),
	sendNotifications: sendPushNotifications,
	now: () => new Date(),
};

/**
 * Cronから呼ばれる定期処理。
 * 1. BWFから試合を取得し、必要なら直近の試合結果も取り直す
 * 2. 新しくライブになった試合をPush通知する
 * 3. 状態が変わった場合だけKVへ保存する
 */
export async function runNotificationCheck(
	env: Env,
	overrides: Partial<NotificationCheckDependencies> = {},
): Promise<NotificationCheckResult> {
	const deps = { ...defaultDependencies, ...overrides };
	const kv = env.NOTIFIED_MATCHES;
	const previous = await kv.get<StoredState>(STATE_KEY, "json");
	const previousResults = previous?.recentResults || [];
	const now = deps.now();

	const fetchedMatches = await deps.fetchMatches(kv, [
		...(previous?.matches || []),
		...previousResults,
	]);
	const matches = fetchedMatches.filter(
		(match) => match.eventType !== "completed",
	);
	const history = await refreshHistoryIfDue(previous, now, () =>
		deps.fetchHistory(kv, [...matches, ...previousResults], now),
	);
	const completed = [
		...fetchedMatches.filter((match) => match.eventType === "completed"),
		...history.completed,
	];

	const liveMatches = matches.filter((match) => match.eventType === "live");
	const newMatches = notificationCandidates(previous, liveMatches);
	const delivery =
		newMatches.length > 0
			? await deps.sendNotifications(env, newMatches)
			: emptyDelivery();

	const notificationAttempts = nextNotificationAttempts(
		previous,
		liveMatches,
		newMatches,
		delivery,
	);
	const next: StoredState = {
		checkedAt: now.toISOString(),
		matches,
		recentResults: mergeRecentResults(previousResults, completed, now),
		calendarCheckedAt: CALENDAR_GENERATED_AT,
		upcomingTournaments: staticTournamentCalendar(),
		historyCheckedAt: history.checkedAt || undefined,
		notificationAttempts,
		notifiedLiveMatches: nextNotifiedLiveMatches(
			previous,
			newMatches,
			notificationAttempts,
			now,
		),
	};

	const stateWritten = shouldPersistState(previous, next, now);
	if (stateWritten) {
		await kv.put(STATE_KEY, JSON.stringify(next));
	}

	const result: NotificationCheckResult = {
		liveMatches: liveMatches.length,
		scheduledMatches: matches.filter((match) => match.eventType === "scheduled")
			.length,
		newMatches: newMatches.length,
		stateWritten,
		...delivery,
	};
	logCheck(result, previous, liveMatches, newMatches);
	return result;
}

/** 12時間ごとに直近7日間の試合結果を取り直す。失敗しても通知処理は続ける。 */
async function refreshHistoryIfDue(
	previous: StoredState | null,
	now: Date,
	fetchHistory: () => Promise<MatchSummary[]>,
): Promise<{ checkedAt: string | null; completed: MatchSummary[] }> {
	const checkedAt =
		previous?.historyCheckedAt || previous?.calendarAttemptedAt || null;
	if (!historyRefreshDue(checkedAt, now)) {
		return { checkedAt, completed: [] };
	}

	try {
		const history = await fetchHistory();
		return {
			checkedAt: now.toISOString(),
			completed: history.filter((match) => match.eventType === "completed"),
		};
	} catch (error) {
		console.error(
			JSON.stringify({
				event: "history-refresh-error",
				error: errorMessage(error),
			}),
		);
		// 失敗時も取得時刻を進め、外部APIへの再試行を次の間隔まで抑える。
		return { checkedAt: now.toISOString(), completed: [] };
	}
}

export function historyRefreshDue(
	checkedAt: string | null | undefined,
	now: Date,
): boolean {
	return elapsedSince(checkedAt, now) >= HISTORY_REFRESH_INTERVAL_MS;
}

/** KVへの書き込みは、内容が変わったときとハートビート間隔を超えたときだけ行う。 */
export function shouldPersistState(
	previous: StoredState | null,
	next: StoredState,
	now: Date,
): boolean {
	if (!previous) return true;
	return (
		stateSignature(previous) !== stateSignature(next) ||
		elapsedSince(previous.checkedAt, now) >= STATE_MAX_AGE_MS
	);
}

/** checkedAt以外で、保存内容が変わったかを比較するための文字列。 */
function stateSignature(state: StoredState): string {
	return JSON.stringify([
		sortedById(state.matches),
		sortedById(state.recentResults || []),
		state.upcomingTournaments || [],
		state.calendarCheckedAt || null,
		state.historyCheckedAt || null,
		state.notificationAttempts || {},
		state.notifiedLiveMatches || {},
	]);
}

function sortedById(matches: MatchSummary[]): MatchSummary[] {
	return [...matches].sort((left, right) => left.id.localeCompare(right.id));
}

/** 時刻が未設定・不正な場合は無限大の経過時間として扱う。 */
function elapsedSince(timestamp: string | null | undefined, now: Date): number {
	const time = timestamp ? Date.parse(timestamp) : Number.NaN;
	return Number.isFinite(time)
		? now.getTime() - time
		: Number.POSITIVE_INFINITY;
}

/**
 * 通知対象は「新しくライブになり、まだ通知していない試合」と
 * 「前回の送信が全て失敗し、再試行回数が残っている試合」。
 */
function notificationCandidates(
	previous: StoredState | null,
	liveMatches: MatchSummary[],
): MatchSummary[] {
	const previousLiveIds = new Set(
		(previous?.matches || [])
			.filter((match) => match.eventType === "live")
			.map((match) => match.id),
	);
	return liveMatches.filter((match) => {
		const attempts = previous?.notificationAttempts?.[match.id] || 0;
		const retrying = attempts > 0 && attempts < MAX_NOTIFICATION_ATTEMPTS;
		const newlyLive =
			!previousLiveIds.has(match.id) &&
			!previous?.notifiedLiveMatches?.[match.id];
		return retrying || newlyLive;
	});
}

function nextNotificationAttempts(
	previous: StoredState | null,
	liveMatches: MatchSummary[],
	candidates: MatchSummary[],
	delivery: DeliveryResult,
): Record<string, number> {
	const liveIds = new Set(liveMatches.map((match) => match.id));
	const next = Object.fromEntries(
		Object.entries(previous?.notificationAttempts || {}).filter(
			([id, attempts]) =>
				liveIds.has(id) && attempts > 0 && attempts < MAX_NOTIFICATION_ATTEMPTS,
		),
	);
	for (const match of candidates) {
		delete next[match.id];
		const result = delivery.byMatch[match.id];
		// 部分成功は受信済みの購読者へ重複しないよう再送しない。
		const allFailed = result && result.sent === 0 && result.failed > 0;
		if (!allFailed) continue;

		const attempts = (previous?.notificationAttempts?.[match.id] || 0) + 1;
		if (attempts < MAX_NOTIFICATION_ATTEMPTS) {
			next[match.id] = attempts;
		}
	}
	return next;
}

function nextNotifiedLiveMatches(
	previous: StoredState | null,
	candidates: MatchSummary[],
	notificationAttempts: Record<string, number>,
	now: Date,
): Record<string, string> {
	const next = Object.fromEntries(
		Object.entries(previous?.notifiedLiveMatches || {}).filter(
			([, notifiedAt]) =>
				elapsedSince(notifiedAt, now) <= NOTIFICATION_DEDUP_AGE_MS,
		),
	);

	// Migration: when upgrading from a version without notifiedLiveMatches,
	// seed the ledger with any matches already live to prevent double-sending.
	// Skip this block once notifiedLiveMatches exists so that genuinely new
	// live matches are not silently registered as already-notified.
	if (!previous?.notifiedLiveMatches) {
		for (const match of previous?.matches || []) {
			if (
				match.eventType === "live" &&
				!previous?.notificationAttempts?.[match.id]
			) {
				next[match.id] = previous?.checkedAt || now.toISOString();
			}
		}
	}
	for (const match of candidates) {
		if (!notificationAttempts[match.id]) {
			next[match.id] = now.toISOString();
		}
	}
	return next;
}

/** 直近7日間の試合結果を、新しい順に保持する。 */
export function mergeRecentResults(
	previous: MatchSummary[],
	fetched: MatchSummary[],
	now: Date,
): MatchSummary[] {
	const cutoff = now.getTime() - RECENT_RESULTS_MAX_AGE_MS;
	const byId = new Map(previous.map((match) => [match.id, match]));
	for (const match of fetched) {
		const existing = byId.get(match.id);
		byId.set(match.id, {
			...existing,
			...match,
			completedAt: existing?.completedAt || now.toISOString(),
		});
	}
	return [...byId.values()]
		.filter((match) => resultTime(match) >= cutoff)
		.sort((left, right) => resultTime(right) - resultTime(left));
}

function resultTime(match: MatchSummary): number {
	for (const value of [
		match.startTime,
		match.tournamentDate,
		match.completedAt,
	]) {
		if (!value) continue;
		// 日付だけの値は日本時間の正午として扱う。
		const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
		const timestamp = Date.parse(
			isDateOnly ? `${value}T12:00:00+09:00` : value,
		);
		if (Number.isFinite(timestamp)) return timestamp;
	}
	return 0;
}

/** todayを含む過去days日分の日付を古い順に返す。 */
function recentDates(today: string, days: number): string[] {
	const base = new Date(`${today}T12:00:00Z`);
	return Array.from({ length: days }, (_, index) => {
		const date = new Date(base);
		date.setUTCDate(base.getUTCDate() - index);
		return date.toISOString().slice(0, 10);
	}).reverse();
}

function emptyDelivery(): DeliveryResult {
	return { sent: 0, failed: 0, removed: 0, byMatch: {} };
}

function logCheck(
	result: NotificationCheckResult,
	previous: StoredState | null,
	liveMatches: MatchSummary[],
	candidates: MatchSummary[],
): void {
	console.log(JSON.stringify({ event: "notification-check", ...result }));
	console.log(
		JSON.stringify({
			event: "notification-check-detail",
			previousLiveIds: (previous?.matches || [])
				.filter((match) => match.eventType === "live")
				.map((match) => match.id),
			notifiedLiveMatchIds: Object.keys(previous?.notifiedLiveMatches || {}),
			notificationAttempts: previous?.notificationAttempts || {},
			currentLiveIds: liveMatches.map((match) => match.id),
			candidateIds: candidates.map((match) => match.id),
		}),
	);
}
