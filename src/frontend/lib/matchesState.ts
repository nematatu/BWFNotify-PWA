import { createSignal } from "solid-js";
import type { MatchSummary, PublicState, UpcomingTournament } from "../../type";
import { type PollingMode, pollingMode } from "./pollingPolicy";
import {
	api,
	DEFAULT_SORT_ORDER,
	isValidSortOrder,
	mergeLiveMatches,
	type SortOrder,
} from "./utils";
import { type MainView, preferredInitialView } from "./viewPolicy";

export type { MainView } from "./viewPolicy";

const LIVE_POLL_MS = 15_000;
const FULL_POLL_MS = 2 * 60_000;
const IDLE_TIMEOUT_MS = 5 * 60_000;

function readSavedSort(): SortOrder | null {
	const saved = localStorage.getItem("bwf-sort-order");
	return isValidSortOrder(saved) ? saved : null;
}

// --- Domain States ---
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
let fullTimer: ReturnType<typeof setTimeout> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let currentPollingMode: PollingMode = "paused";
let initialViewSelected = false;

export const setCurrentView = (view: MainView) => {
	initialViewSelected = true;
	setCurrentViewSignal(view);
};

// --- Domain Actions ---
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
	} catch (e) {
		console.error("Failed to load status:", e);
	}
};

export const loadLive = async () => {
	if (livePromise) return livePromise;
	const run = async () => {
		try {
			const state = await api<PublicState>("/api/live", {
				cache: "no-store",
			});
			setMatches((prev) => mergeLiveMatches(prev, state.matches));
			syncPollingMode();
		} catch (e) {
			console.error("Failed to load live:", e);
		} finally {
			livePromise = null;
		}
	};
	livePromise = run();
	return livePromise;
};

export const refreshAll = async () => {
	try {
		await loadStatus();
		if (matches().some((m) => m.eventType === "live")) {
			await loadLive();
		}
	} catch (e) {
		console.error("Refresh failed:", e);
	}
};

const scheduleLive = () => {
	if (liveTimer) {
		clearTimeout(liveTimer);
		liveTimer = null;
	}
	if (idle() || document.visibilityState !== "visible") return;
	if (!matches().some((m) => m.eventType === "live")) return;

	liveTimer = setTimeout(async () => {
		await loadLive();
		scheduleLive();
	}, LIVE_POLL_MS);
};

const stopTimers = () => {
	if (liveTimer) {
		clearTimeout(liveTimer);
		liveTimer = null;
	}
	if (fullTimer) {
		clearInterval(fullTimer);
		fullTimer = null;
	}
};

const syncPollingMode = () => {
	const next = pollingMode({
		visible: document.visibilityState === "visible",
		idle: idle(),
		hasLiveMatches: matches().some((match) => match.eventType === "live"),
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
	localStorage.setItem("bwf-sort-order", order);
	setSortOrderSignal(order);
};

// --- Lifecycle Sync ---
let initialized = false;
export function initMatchesState() {
	if (initialized) return;
	initialized = true;

	const onVisibility = () => {
		if (document.visibilityState === "visible") {
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
		}, 200);
		resetIdle();
	};

	document.addEventListener("visibilitychange", onVisibility);
	window.addEventListener("mousemove", onActivity, { passive: true });
	window.addEventListener("click", onActivity);
	window.addEventListener("keydown", onActivity);
	window.addEventListener("scroll", onActivity, { passive: true });

	// Initialize
	const init = async () => {
		await Promise.all([loadStatus()]);
		resetIdle();
		if (matches().some((m) => m.eventType === "live")) {
			await loadLive();
		}
		startPolling();
	};
	void init();

	// Clean up resources on page unload
	window.addEventListener("beforeunload", () => {
		document.removeEventListener("visibilitychange", onVisibility);
		window.removeEventListener("mousemove", onActivity);
		window.removeEventListener("click", onActivity);
		window.removeEventListener("keydown", onActivity);
		window.removeEventListener("scroll", onActivity);
		stopPolling();
		if (idleTimer) clearTimeout(idleTimer);
		if (idleThrottle) clearTimeout(idleThrottle);
	});
}
