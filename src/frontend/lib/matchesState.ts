import { createSignal } from "solid-js";
import type { MatchSummary, PublicState, UpcomingTournament } from "../../type";
import { api } from "./api";
import { whenIdle } from "./browser";
import {
	DEFAULT_SORT_ORDER,
	keepNewerLiveScores,
	mergeLiveMatches,
	type SortOrder,
} from "./matchList";
import {
	IDLE_TIMEOUT_MS,
	idleRemainingMs,
	msUntilNextStart,
	needsLiveScores,
	type PollingMode,
	pollingMode,
} from "./pollingPolicy";
import { reuseUnchanged } from "./stableItems";
import {
	browserStorage,
	readCachedStatus,
	writeCachedStatus,
} from "./statusCache";
import { type MainView, preferredInitialView } from "./viewPolicy";

export type { MainView } from "./viewPolicy";

/** ライブ得点（/api/live）の取得間隔。ライブ試合がある間だけ動く。 */
const LIVE_POLL_MS = 15_000;
/** 全試合情報（/api/status）の取得間隔。 */
const FULL_POLL_MS = 2 * 60_000;
const ACTIVITY_THROTTLE_MS = 200;
/** 以前は並び順を端末に保存していた。開くたびに「時間が早い順」から始めるため、残っていれば消す */
const LEGACY_SORT_STORAGE_KEY = "bwf-sort-order";

// --- 状態 ---
// 書き換えはこのモジュールの操作関数だけに限り、外部へは読み取り関数だけを公開する。
const [matches, setMatches] = createSignal<MatchSummary[]>([]);
const [checkedAt, setCheckedAt] = createSignal<string | null>(null);
const [recentResults, setRecentResults] = createSignal<MatchSummary[]>([]);
const [upcomingTournaments, setUpcomingTournaments] = createSignal<
	UpcomingTournament[]
>([]);
const [currentView, setCurrentViewSignal] = createSignal<MainView>("live");
/** 並び順。開いたときは常に「時間が早い順」から始める */
const [sortOrder, setSortOrderSignal] =
	createSignal<SortOrder>(DEFAULT_SORT_ORDER);
const [idle, setIdle] = createSignal(false);
/** 試合情報を一度でも表示できたか（保存データまたは最新の取得）。未取得の間は「読み込み中」を出す。 */
const [statusLoaded, setStatusLoaded] = createSignal(false);
/** 直近の試合情報の取得に失敗したか。表示できる情報がないときは、読み込み中ではなく失敗を伝える。 */
const [statusFailed, setStatusFailed] = createSignal(false);

export {
	checkedAt,
	currentView,
	matches,
	recentResults,
	sortOrder,
	statusFailed,
	statusLoaded,
	upcomingTournaments,
};

let livePromise: Promise<void> | null = null;
let liveTimer: ReturnType<typeof setTimeout> | null = null;
let fullTimer: ReturnType<typeof setInterval> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let lastActivityAt = Date.now();
let currentPollingMode: PollingMode = "paused";
/** 利用者がタブを選ぶまでは、取得結果に応じて初期タブを選び直す。 */
let initialViewSelected = false;

let startTimer: ReturnType<typeof setTimeout> | null = null;
/** 最後に反映した `/api/live` の取得時刻。全体の情報より新しければ得点を残す。 */
let liveCheckedAt: string | null = null;

/** ライブ得点を取りに行く必要があるか。開始時刻を過ぎた「このあと」の試合も含む。 */
const hasLiveMatches = () => needsLiveScores(matches(), Date.now());
const pageVisible = () => document.visibilityState === "visible";

export const setCurrentView = (view: MainView) => {
	initialViewSelected = true;
	setCurrentViewSignal(view);
};

// --- 取得 ---

/**
 * 試合情報を画面へ反映する。`fresh` が false（前回の保存データ）の場合は、
 * 最新の情報が届いたときに初期タブを選び直せるよう、タブの選択を確定しない。
 */
const applyStatus = (state: PublicState, fresh: boolean) => {
	setCheckedAt(state.checkedAt);
	// 内容が変わっていない試合は前回のオブジェクトを使い、カードを作り直さない
	setMatches((previous) =>
		reuseUnchanged(
			previous,
			keepNewerLiveScores(
				previous,
				state.matches || [],
				liveCheckedAt,
				state.checkedAt,
			),
		),
	);
	setRecentResults((previous) =>
		reuseUnchanged(previous, state.recentResults || []),
	);
	setUpcomingTournaments((previous) =>
		reuseUnchanged(previous, state.upcomingTournaments || []),
	);
	setStatusLoaded(true);
	if (!initialViewSelected) {
		setCurrentViewSignal(
			preferredInitialView(
				state.matches || [],
				state.recentResults?.length || 0,
				state.upcomingTournaments?.length || 0,
			),
		);
		initialViewSelected = fresh;
	}
};

export const loadStatus = async () => {
	try {
		// 初回は index.html の preload で取得済みの応答が使われる
		const state = await api<PublicState>("/api/status");
		applyStatus(state, true);
		setStatusFailed(false);
		syncPollingMode();
		// 約150KBの保存は描画を待たせるため、画面を描き終えたあとの空き時間に行う
		whenIdle(() => writeCachedStatus(browserStorage(), state));
	} catch (error) {
		setStatusFailed(true);
		console.error("Failed to load status:", error);
	}
};

const loadLive = async () => {
	// 取得中の場合は同じリクエストを共有し、二重に取得しない。
	if (livePromise) return livePromise;
	const run = async () => {
		try {
			const state = await api<PublicState>("/api/live", {
				cache: "no-store",
			});
			setMatches((prev) =>
				reuseUnchanged(prev, mergeLiveMatches(prev, state.matches)),
			);
			liveCheckedAt = state.checkedAt;
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
const refreshAll = async () => {
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

const clearStartTimer = () => {
	if (startTimer) clearTimeout(startTimer);
	startTimer = null;
};

const stopTimers = () => {
	clearLiveTimer();
	clearStartTimer();
	if (fullTimer) clearInterval(fullTimer);
	fullTimer = null;
};

/**
 * 次の「このあと」の試合の開始時刻に取得モードを見直す。
 * 2分ごとの全体取得を待たずに、開始時刻からライブ得点を取りに行く。
 */
const scheduleStartCheck = () => {
	clearStartTimer();
	if (currentPollingMode !== "active") return;
	const delay = msUntilNextStart(matches(), Date.now());
	if (delay === undefined) return;
	startTimer = setTimeout(() => {
		startTimer = null;
		syncPollingMode();
	}, delay);
};

/** 表示状態・操作状態・ライブ試合の有無から取得モードを決め、変化時だけタイマーを張り直す。 */
const syncPollingMode = () => {
	const next = pollingMode({
		visible: pageVisible(),
		idle: idle(),
		hasLiveMatches: hasLiveMatches(),
	});
	if (next === currentPollingMode) {
		scheduleStartCheck();
		return;
	}

	stopTimers();
	currentPollingMode = next;
	if (next === "paused") return;

	fullTimer = setInterval(() => void loadStatus(), FULL_POLL_MS);
	if (next === "live") scheduleLive();
	scheduleStartCheck();
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
	lastActivityAt = Date.now();
	scheduleIdleCheck(IDLE_TIMEOUT_MS);
};

/**
 * 操作がない時間が上限を超えたら取得を止める。上限はライブ試合の有無で
 * 変わるため、期限が来たときに残り時間を計算し直し、残っていれば待ち直す。
 */
const scheduleIdleCheck = (delayMs: number) => {
	if (idleTimer) clearTimeout(idleTimer);
	idleTimer = setTimeout(() => {
		const remaining = idleRemainingMs({
			elapsedMs: Date.now() - lastActivityAt,
			hasLiveMatches: hasLiveMatches(),
		});
		if (remaining > 0) {
			scheduleIdleCheck(remaining);
			return;
		}
		setIdle(true);
		stopPolling();
	}, delayMs);
};

export const setSortOrder = (order: SortOrder) => {
	setSortOrderSignal(order);
};

// --- ライフサイクル ---
let initialized = false;
export function initMatchesState() {
	if (initialized) return;
	initialized = true;
	try {
		localStorage.removeItem(LEGACY_SORT_STORAGE_KEY);
	} catch {
		// 保存領域が使えない環境では何もしない
	}

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
	const passiveEvents = new Set(["mousemove", "scroll"]);
	document.addEventListener("visibilitychange", onVisibility);
	for (const type of activityEvents) {
		window.addEventListener(type, onActivity, {
			passive: passiveEvents.has(type),
		});
	}

	// 前回の試合情報があれば、取得を待たずにすぐ表示する
	const cached = readCachedStatus(browserStorage());
	if (cached) applyStatus(cached, false);

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
