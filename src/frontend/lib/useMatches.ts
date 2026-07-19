import { createSignal, onCleanup, onMount } from "solid-js";
import type { MatchSummary, PublicState } from "../../type";
import { api, mergeLiveMatches } from "./utils";

const LIVE_POLL_MS = 15_000;
const FULL_POLL_MS = 2 * 60_000;
const IDLE_TIMEOUT_MS = 5 * 60_000;

export function useMatches() {
	const [matches, setMatches] = createSignal<MatchSummary[]>([]);
	const [checkedAt, setCheckedAt] = createSignal<string | null>(null);
	const [idle, setIdle] = createSignal(false);

	let livePromise: Promise<void> | null = null;
	let liveTimer: ReturnType<typeof setTimeout> | null = null;
	let fullTimer: ReturnType<typeof setTimeout> | null = null;
	let idleTimer: ReturnType<typeof setTimeout> | null = null;

	const loadStatus = async () => {
		try {
			const state = await api<PublicState>("/api/status");
			setCheckedAt(state.checkedAt);
			setMatches(state.matches);
		} catch (e) {
			console.error("Failed to load status:", e);
		}
	};

	const loadLive = async () => {
		if (livePromise) return livePromise;
		const run = async () => {
			try {
				const state = await api<PublicState>("/api/live", {
					cache: "no-store",
				});
				setMatches((prev) => mergeLiveMatches(prev, state.matches));
			} catch (e) {
				console.error("Failed to load live:", e);
			} finally {
				livePromise = null;
			}
		};
		livePromise = run();
		return livePromise;
	};

	const refreshAll = async () => {
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

	const startPolling = () => {
		stopPolling();
		if (idle() || document.visibilityState !== "visible") return;
		fullTimer = setInterval(() => void loadStatus(), FULL_POLL_MS);
		scheduleLive();
	};

	const stopPolling = () => {
		if (liveTimer) {
			clearTimeout(liveTimer);
			liveTimer = null;
		}
		if (fullTimer) {
			clearInterval(fullTimer);
			fullTimer = null;
		}
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

	onMount(() => {
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

		onCleanup(() => {
			document.removeEventListener("visibilitychange", onVisibility);
			window.removeEventListener("mousemove", onActivity);
			window.removeEventListener("click", onActivity);
			window.removeEventListener("keydown", onActivity);
			window.removeEventListener("scroll", onActivity);
			stopPolling();
			if (idleTimer) clearTimeout(idleTimer);
			if (idleThrottle) clearTimeout(idleThrottle);
		});
	});

	return {
		matches,
		checkedAt,
		loadStatus,
		refreshAll,
	};
}
