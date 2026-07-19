import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";
import type { MatchSummary, PublicState } from "../type";
import { AppFooter } from "./components/AppFooter";
import { AppHeader } from "./components/AppHeader";
import {
	type InstallGuidance,
	InstallOverlay,
} from "./components/InstallOverlay";
import { MatchList } from "./components/MatchList";
import { MatchToolbar } from "./components/MatchToolbar";
import { NotificationSettings } from "./components/NotificationSettings";
import { PermissionOverlay } from "./components/PermissionOverlay";
import { PwaBanner } from "./components/PwaBanner";
import { api, errorMessage } from "./lib/api";
import {
	isGoogleApp,
	isInAppBrowser,
	isIosDevice,
	isMobileBrowser,
	isStandaloneDisplay,
} from "./lib/device";
import { base64UrlToBytes } from "./lib/push";
import {
	DEFAULT_SORT_ORDER,
	isValidSortOrder,
	type SortOrder,
} from "./lib/sort";
import { mergeLiveMatches } from "./match-groups";

// --- Constants ---
const LIVE_POLL_MS = 15_000;
const FULL_POLL_MS = 2 * 60_000;
const IDLE_TIMEOUT_MS = 5 * 60_000;

interface DeferredInstallPrompt {
	prompt: () => Promise<void>;
	userChoice?: Promise<{ outcome: "accepted" | "dismissed" | string }>;
}

export default function App() {
	// --- Match state ---
	const [matches, setMatches] = createSignal<MatchSummary[]>([]);
	const [checkedAt, setCheckedAt] = createSignal<string | null>(null);
	const [currentView, setCurrentView] = createSignal<"live" | "scheduled">(
		"live",
	);
	const [sortOrder, setSortOrder] = createSignal<SortOrder>(
		readSavedSort() || DEFAULT_SORT_ORDER,
	);

	// --- Notification state ---
	const [notifText, setNotifText] = createSignal("確認中");
	const [notifError, setNotifError] = createSignal(false);
	const [testDisabled, setTestDisabled] = createSignal(true);
	const [toggleChecked, setToggleChecked] = createSignal(false);
	const [toggleDisabled, setToggleDisabled] = createSignal(true);
	const [excludedIds, setExcludedIds] = createSignal<Set<string>>(new Set());
	const [subscription, setSubscription] = createSignal<PushSubscription | null>(
		null,
	);

	// --- Install / PWA state ---
	const [installPrompt, setInstallPrompt] =
		createSignal<DeferredInstallPrompt | null>(null);
	const [installOpen, setInstallOpen] = createSignal(false);
	const [permissionOpen, setPermissionOpen] = createSignal(false);
	const [bannerHidden, setBannerHidden] = createSignal(true);

	// --- Non-reactive refs ---
	let registration: ServiceWorkerRegistration | undefined;
	let vapidKey: string | undefined;
	let savingPrefs = false;
	let livePromise: Promise<void> | null = null;
	let liveTimer: ReturnType<typeof setTimeout> | null = null;
	let fullTimer: ReturnType<typeof setTimeout> | null = null;
	let idleTimer: ReturnType<typeof setTimeout> | null = null;
	const [idle, setIdle] = createSignal(false);
	let dismissBtn: HTMLButtonElement | undefined;

	// --- Derived values ---
	const liveCount = createMemo(
		() => matches().filter((m) => m.eventType === "live").length,
	);
	const scheduledCount = createMemo(
		() => matches().filter((m) => m.eventType === "scheduled").length,
	);
	const filtered = createMemo(() =>
		matches().filter((m) => m.eventType === currentView()),
	);
	const standalone = () => isStandaloneDisplay();
	const inApp = () => isInAppBrowser();
	const notificationDisabled = createMemo(
		() =>
			!(
				subscription() &&
				"Notification" in window &&
				Notification.permission === "granted"
			),
	);

	const guidance = createMemo((): InstallGuidance => {
		if (installPrompt())
			return {
				title: "ホーム画面に追加",
				description: "下のボタンを押すと、ブラウザの追加確認が開きます。",
				hasAction: true,
			};
		if (isGoogleApp())
			return {
				title: "SafariまたはChromeで開く",
				description:
					"Googleアプリのメニューから外部ブラウザで開き、共有またはブラウザメニューの「ホーム画面に追加」を選びます。",
				hasAction: false,
			};
		if (isIosDevice())
			return {
				title: "共有メニューを開く",
				description:
					"共有メニューから「ホーム画面に追加」を選びます。追加後はホーム画面のアイコンから起動します。",
				hasAction: false,
			};
		return {
			title: "ブラウザのメニューを開く",
			description:
				"メニューの「アプリをインストール」または「ホーム画面に追加」を選びます。",
			hasAction: false,
		};
	});

	// --- Lifecycle ---
	onMount(() => {
		const onBeforeInstall = (e: Event) => {
			e.preventDefault();
			setInstallPrompt(e as unknown as DeferredInstallPrompt);
		};
		const onAppInstalled = () => {
			setInstallPrompt(null);
			closeInstall(true);
		};
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

		window.addEventListener("beforeinstallprompt", onBeforeInstall);
		window.addEventListener("appinstalled", onAppInstalled);
		document.addEventListener("visibilitychange", onVisibility);
		window.addEventListener("mousemove", onActivity, { passive: true });
		window.addEventListener("click", onActivity);
		window.addEventListener("keydown", onActivity);
		window.addEventListener("scroll", onActivity, { passive: true });

		void init();

		onCleanup(() => {
			window.removeEventListener("beforeinstallprompt", onBeforeInstall);
			window.removeEventListener("appinstalled", onAppInstalled);
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

	// --- Core logic ---
	async function init() {
		await Promise.all([initNotifications(), loadStatus()]);
		resetIdle();
		if (matches().some((m) => m.eventType === "live")) await loadLive();
		startPolling();
	}

	async function loadStatus() {
		try {
			const state = await api<PublicState>("/api/status");
			setCheckedAt(state.checkedAt);
			setMatches(state.matches);
		} catch (e) {
			console.error("Failed to load status:", e);
		}
	}

	async function loadLive() {
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
	}

	async function refreshAll() {
		try {
			await loadStatus();
			if (matches().some((m) => m.eventType === "live")) await loadLive();
		} catch (e) {
			console.error("Refresh failed:", e);
		}
	}

	// --- Polling ---
	function startPolling() {
		stopPolling();
		if (idle() || document.visibilityState !== "visible") return;
		fullTimer = setInterval(() => void loadStatus(), FULL_POLL_MS);
		scheduleLive();
	}

	// stops the automatic polls (exposed for tests, or cleanups)
	function stopPolling() {
		if (liveTimer) {
			clearTimeout(liveTimer);
			liveTimer = null;
		}
		if (fullTimer) {
			clearInterval(fullTimer);
			fullTimer = null;
		}
	}

	function scheduleLive() {
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
	}

	function resetIdle() {
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
	}

	// --- Notifications ---
	async function initNotifications() {
		if (!window.isSecureContext) {
			setStatus("通知にはHTTPS接続が必要です", true);
			return;
		}
		if (!standalone() && isMobileBrowser()) setBannerHidden(false);
		if (!("serviceWorker" in navigator)) {
			setStatus("ホーム画面版で通知を利用できます");
			setToggleDisabled(true);
			setTestDisabled(true);
			return;
		}
		try {
			registration = await navigator.serviceWorker.register("/pwa/sw.js", {
				scope: "/",
			});
			if (!("pushManager" in registration) || !("Notification" in window)) {
				setStatus("ホーム画面版で通知を利用できます");
				setToggleDisabled(true);
				setTestDisabled(true);
				return;
			}
			const cfg = await api<{ vapidPublicKey?: string }>("/api/config");
			vapidKey = cfg.vapidPublicKey;
			const sub = await registration.pushManager.getSubscription();
			setSubscription(sub);
			if (sub && Notification.permission === "granted") {
				await saveSubscription(sub);
				setToggleChecked(true);
				setTestDisabled(false);
				setStatus("有効");
			} else if (Notification.permission === "denied") {
				setStatus("ブラウザ設定で拒否されています", true);
			} else {
				setStatus("オフ");
			}
			setToggleDisabled(Notification.permission === "denied");
		} catch (e) {
			setStatus(errorMessage(e), true);
		}
	}

	function setStatus(text: string, isError = false) {
		setNotifText(text);
		setNotifError(isError);
	}

	async function updateSubscription(enabled: boolean) {
		if (!registration || !vapidKey) return;
		setToggleDisabled(true);
		setTestDisabled(true);
		try {
			if (enabled) {
				const sub = await registration.pushManager.subscribe({
					userVisibleOnly: true,
					applicationServerKey: base64UrlToBytes(vapidKey),
				});
				setSubscription(sub);
				await saveSubscription(sub);
				setToggleChecked(true);
				setTestDisabled(false);
				setStatus("有効");
			} else {
				const sub = subscription();
				if (sub) {
					await sub.unsubscribe();
					await api("/api/subscriptions", {
						method: "DELETE",
						body: JSON.stringify({ endpoint: sub.endpoint }),
					});
				}
				setSubscription(null);
				setToggleChecked(false);
				setTestDisabled(true);
				setStatus("オフ");
			}
		} catch (e) {
			setStatus(errorMessage(e), true);
			setToggleChecked(false);
		} finally {
			setToggleDisabled(Notification.permission === "denied");
		}
	}

	async function saveSubscription(sub: PushSubscription) {
		const res = await api<{ excludedMatchIds?: string[] }>(
			"/api/subscriptions",
			{ method: "POST", body: JSON.stringify({ subscription: sub }) },
		);
		setExcludedIds(
			new Set(Array.isArray(res.excludedMatchIds) ? res.excludedMatchIds : []),
		);
	}

	async function sendTest() {
		const sub = subscription();
		if (!sub) return;
		setTestDisabled(true);
		try {
			await api("/api/subscriptions", {
				method: "POST",
				body: JSON.stringify({ subscription: sub, test: true }),
			});
		} catch (e) {
			alert(errorMessage(e));
		} finally {
			setTestDisabled(false);
		}
	}

	async function updateMatchNotif(matchId: string, enabled: boolean) {
		const sub = subscription();
		if (!sub || savingPrefs) return;
		savingPrefs = true;
		const prev = new Set(excludedIds());
		const next = new Set(prev);
		if (enabled) next.delete(matchId);
		else next.add(matchId);
		setExcludedIds(next);
		try {
			await api("/api/subscriptions", {
				method: "PATCH",
				body: JSON.stringify({
					endpoint: sub.endpoint,
					matchId,
					excluded: !enabled,
				}),
			});
		} catch (e) {
			alert(errorMessage(e));
			setExcludedIds(prev);
		} finally {
			savingPrefs = false;
		}
	}

	// --- Toggle handlers ---
	function onToggleClick(e: Event) {
		if (!standalone()) {
			e.preventDefault();
			openInstall();
			return;
		}
		if (
			!toggleChecked() &&
			"Notification" in window &&
			Notification.permission === "default"
		) {
			e.preventDefault();
			openPermission();
		}
	}

	function onToggleChange(e: Event) {
		if (!standalone()) return;
		void updateSubscription((e.target as HTMLInputElement).checked);
	}

	// --- Overlay helpers ---
	function openInstall() {
		if (standalone() || installDismissed()) return;
		setInstallOpen(true);
		document.body.classList.add("overlay-open");
	}

	function closeInstall(dismiss = false) {
		setInstallOpen(false);
		document.body.classList.remove("overlay-open");
		if (dismiss) {
			try {
				sessionStorage.setItem("bwf-install-overlay-dismissed", "1");
			} catch {
				/* private mode */
			}
		}
	}

	function installDismissed(): boolean {
		try {
			return sessionStorage.getItem("bwf-install-overlay-dismissed") === "1";
		} catch {
			return false;
		}
	}

	function openPermission() {
		setPermissionOpen(true);
		document.body.classList.add("overlay-open");
	}

	function closePermission() {
		setPermissionOpen(false);
		document.body.classList.remove("overlay-open");
	}

	async function handleInstall() {
		const prompt = installPrompt();
		if (!prompt) return;
		try {
			await prompt.prompt();
			const choice = await prompt.userChoice;
			setInstallPrompt(null);
			if (choice?.outcome === "accepted") closeInstall();
			else dismissBtn?.focus();
		} catch (e) {
			console.error("Install prompt error:", e);
		}
	}

	function handleSortChange(order: string) {
		if (isValidSortOrder(order)) {
			localStorage.setItem("bwf-sort-order", order);
			setSortOrder(order);
		}
	}

	// --- Render ---
	return (
		<div>
			<main>
				<AppHeader checkedAt={checkedAt()} hasError={notifError()} />

				<PwaBanner
					hidden={bannerHidden()}
					inApp={inApp()}
					onShowInstall={openInstall}
				/>

				<NotificationSettings
					text={notifText()}
					error={notifError()}
					testDisabled={testDisabled()}
					toggleChecked={toggleChecked()}
					toggleDisabled={toggleDisabled()}
					standalone={standalone()}
					inApp={inApp()}
					onTest={sendTest}
					onToggleClick={onToggleClick}
					onToggleChange={onToggleChange}
					onShowInstall={openInstall}
				/>

				<section class="matches" aria-labelledby="matches-heading">
					<h2 id="matches-heading" class="visually-hidden">
						試合
					</h2>
					<MatchToolbar
						view={currentView()}
						liveCount={liveCount()}
						scheduledCount={scheduledCount()}
						sortOrder={sortOrder()}
						onViewChange={setCurrentView}
						onSortChange={handleSortChange}
						onRefresh={() => void refreshAll()}
					/>
					<MatchList
						matches={filtered()}
						sortOrder={sortOrder()}
						view={currentView()}
						excludedMatchIds={excludedIds()}
						notificationDisabled={notificationDisabled()}
						onNotificationChange={updateMatchNotif}
					/>
				</section>

				<AppFooter />
			</main>

			<Show when={installOpen()}>
				<InstallOverlay
					guidance={guidance()}
					onClose={() => closeInstall(true)}
					onInstall={handleInstall}
					dismissRef={(el) => {
						dismissBtn = el;
					}}
				/>
			</Show>

			<Show when={permissionOpen()}>
				<PermissionOverlay
					onCancel={() => {
						closePermission();
						setToggleChecked(false);
					}}
					onConfirm={() => {
						closePermission();
						setToggleChecked(true);
						void updateSubscription(true);
					}}
				/>
			</Show>
		</div>
	);
}

function readSavedSort(): SortOrder | null {
	const saved = localStorage.getItem("bwf-sort-order");
	return isValidSortOrder(saved) ? saved : null;
}
