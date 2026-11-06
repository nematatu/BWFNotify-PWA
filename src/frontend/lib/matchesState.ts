import { createSignal } from "solid-js";
import type { MatchSummary, PublicState, UpcomingTournament } from "../../type";
import { api } from "./api";
import {
	DEFAULT_SORT_ORDER,
	isValidSortOrder,
	mergeLiveMatches,
	type SortOrder,
} from "./matchList";
import { type PollingMode, pollingMode } from "./pollingPolicy";
import { type MainView, preferredInitialView } from "./viewPolicy";

export type { MainView } from "./viewPolicy";

/** ライブ得点（/api/live）の取得間隔。ライブ試合がある間だけ動く。 */
const LIVE_POLL_MS = 15_000;
/** 全試合情報（/api/status）の取得間隔。 */
const FULL_POLL_MS = 2 * 60_000;
/** この時間操作がなければ取得を止める。 */
const IDLE_TIMEOUT_MS = 5 * 60_000;
const ACTIVITY_THROTTLE_MS = 200;
const SORT_STORAGE_KEY = "bwf-sort-order";

function readSavedSort(): SortOrder | null {
	const saved = localStorage.getItem(SORT_STORAGE_KEY);
	return isValidSortOrder(saved) ? saved : null;
}

// --- 状態 ---
export const [matches, setMatches] = createSignal<MatchSummary[]>([]);
export const [checkedAt, setCheckedAt] = createSignal<string | null>(null);
export const [recentResults, setRecentResults] = createSignal<MatchSummary[]>(
	[],
);
export const [calendarCheckedAt, setCalendarCheckedAt] = createSignal<
	string | null
>(null);
export const [upcomingTournaments, setUpcomingTournaments] = createSignal<
	UpcomingTournament[]
>([]);
export const [currentView, setCurrentViewSignal] =
	createSignal<MainView>("live");
export const [sortOrder, setSortOrderSignal] = createSignal<SortOrder>(
	readSavedSort() || DEFAULT_SORT_ORDER,
);
const [idle, setIdle] = createSignal(false);

let livePromise: Promise<void> | null = null;
let liveTimer: ReturnType<typeof setTimeout> | null = null;
let fullTimer: ReturnType<typeof setInterval> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let currentPollingMode: PollingMode = "paused";
/** 利用者がタブを選ぶまでは、取得結果に応じて初期タブを選び直す。 */
let initialViewSelected = false;

const hasLiveMatches = () =>
	matches().some((match) => match.eventType === "live");
const pageVisible = () => document.visibilityState === "visible";

export const setCurrentView = (view: MainView) => {
	initialViewSelected = true;
	setCurrentViewSignal(view);
};

// --- 取得 ---
export const loadStatus = async () => {
	try {
		const state = await api<PublicState>("/api/status");
		setCheckedAt(state.checkedAt);
		setMatches(state.matches || []);
		setRecentResults(state.recentResults || []);
		setCalendarCheckedAt(state.calendarCheckedAt || null);
		setUpcomingTournaments(state.upcomingTournaments || []);
		if (!initialViewSelected) {
			setCurrentViewSignal(
				preferredInitialView(
					state.matches || [],
					state.recentResults?.length || 0,
					state.upcomingTournaments?.length || 0,
				),
			);
			initialViewSelected = true;
		}
		syncPollingMode();
	} catch (error) {
		console.error("Failed to load status:", error);
	}
};

export const loadLive = async () => {
	// 取得中の場合は同じリクエストを共有し、二重に取得しない。
	if (livePromise) return livePromise;
	const run = async () => {
		try {
			const state = await api<PublicState>("/api/live", {
				cache: "no-store",
			});
			setMatches((prev) => mergeLiveMatches(prev, state.matches));
			syncPollingMode();
		} catch (error) {
			console.error("Failed to load live:", error);
		} finally {
			livePromise = null;
		}
	};
	livePromise = run();
	return livePromise;
};

/** loadStatus・loadLiveはどちらも失敗を記録して握りつぶすため、例外は投げない。 */
export const refreshAll = async () => {
	await loadStatus();
	if (hasLiveMatches()) await loadLive();
};

// --- 定期取得 ---

const clearLiveTimer = () => {
	if (liveTimer) clearTimeout(liveTimer);
	liveTimer = null;
};

const scheduleLive = () => {
	clearLiveTimer();
	if (idle() || !pageVisible() || !hasLiveMatches()) return;

	liveTimer = setTimeout(async () => {
		await loadLive();
		scheduleLive();
	}, LIVE_POLL_MS);
};

const stopTimers = () => {
	clearLiveTimer();
	if (fullTimer) clearInterval(fullTimer);
	fullTimer = null;
};

/** 表示状態・操作状態・ライブ試合の有無から取得モードを決め、変化時だけタイマーを張り直す。 */
const syncPollingMode = () => {
	const next = pollingMode({
		visible: pageVisible(),
		idle: idle(),
		hasLiveMatches: hasLiveMatches(),
	});
	if (next === currentPollingMode) return;

	stopTimers();
	currentPollingMode = next;
	if (next === "paused") return;

	fullTimer = setInterval(() => void loadStatus(), FULL_POLL_MS);
	if (next === "live") scheduleLive();
};

const startPolling = () => syncPollingMode();

const stopPolling = () => {
	stopTimers();
	currentPollingMode = "paused";
};

const resetIdle = () => {
	if (idle()) {
		setIdle(false);
		void refreshAll();
		startPolling();
	}
	if (idleTimer) clearTimeout(idleTimer);
	idleTimer = setTimeout(() => {
		setIdle(true);
		stopPolling();
	}, IDLE_TIMEOUT_MS);
};

export const setSortOrder = (order: SortOrder) => {
	localStorage.setItem(SORT_STORAGE_KEY, order);
	setSortOrderSignal(order);
};

// --- ライフサイクル ---
let initialized = false;
export function initMatchesState() {
	if (initialized) return;
	initialized = true;

	const onVisibility = () => {
		if (pageVisible()) {
			void refreshAll();
			startPolling();
		} else {
			stopPolling();
		}
	};

	let idleThrottle: ReturnType<typeof setTimeout> | null = null;
	const onActivity = () => {
		if (idleThrottle) return;
		idleThrottle = setTimeout(() => {
			idleThrottle = null;
		}, ACTIVITY_THROTTLE_MS);
		resetIdle();
	};

	const activityEvents = ["mousemove", "click", "keydown", "scroll"] as const;
	document.addEventListener("visibilitychange", onVisibility);
	for (const type of activityEvents) {
		window.addEventListener(type, onActivity, { passive: true });
	}

	const init = async () => {
		await loadStatus();
		resetIdle();
		if (hasLiveMatches()) await loadLive();
		startPolling();
	};
	void init();

	window.addEventListener("beforeunload", () => {
		document.removeEventListener("visibilitychange", onVisibility);
		for (const type of activityEvents) {
			window.removeEventListener(type, onActivity);
		}
		stopPolling();
		if (idleTimer) clearTimeout(idleTimer);
		if (idleThrottle) clearTimeout(idleThrottle);
	});
}
