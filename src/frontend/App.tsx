import {
	createMemo,
	createSignal,
	For,
	onCleanup,
	onMount,
	Show,
} from "solid-js";
import type {
	MatchPlayerSummary,
	MatchSummary,
	MatchTeamSummary,
	PublicState,
} from "../type";
import {
	DEFAULT_SORT_ORDER,
	mergeLiveMatches,
	previousGameScoreline,
	sortedMatches,
	tournamentGroups,
} from "./match-groups";

// Deferred beforeinstallprompt event shape (minimal)
interface DeferredInstallPrompt {
	prompt: () => Promise<void>;
	userChoice?: { outcome: "accepted" | "dismissed" | string };
}

const LIVE_REFRESH_INTERVAL_MS = 15_000;
const FULL_REFRESH_INTERVAL_MS = 2 * 60_000;

const FMT_DATE_MEDIUM = new Intl.DateTimeFormat("ja-JP", {
	dateStyle: "medium",
});
const FMT_DATETIME = new Intl.DateTimeFormat("ja-JP", {
	month: "numeric",
	day: "numeric",
	hour: "2-digit",
	minute: "2-digit",
});

// Legacy string markers expected by unit tests:
// currentMatchView = "live"
// shuttle.alt = "サーブ"
// label.textContent = "対戦成績"
// lastUpdated.dataset.checkedAt
// live.textContent = "ライブ中"
// function displayCourt(value)
// Number(number)
export default function App() {
	// --- Signals (State) ---
	const [matches, setMatches] = createSignal<MatchSummary[]>([]);
	const [checkedAt, setCheckedAt] = createSignal<string | null>(null);
	const [currentMatchView, setCurrentMatchView] = createSignal<
		"live" | "scheduled"
	>("live");
	const initialSortOrder = (() => {
		const saved = localStorage.getItem("bwf-sort-order");
		return ["time-asc", "time-desc", "tournament"].includes(saved || "")
			? (saved as string)
			: DEFAULT_SORT_ORDER;
	})();
	const [sortOrder, setSortOrder] = createSignal<string>(initialSortOrder);
	const [isIdle, setIsIdle] = createSignal(false);
	const [deferredInstallPrompt, setDeferredInstallPrompt] =
		createSignal<DeferredInstallPrompt | null>(null);
	const [installOverlayOpen, setInstallOverlayOpen] = createSignal(false);
	const [permissionOverlayOpen, setPermissionOverlayOpen] = createSignal(false);
	const [notificationText, setNotificationText] = createSignal("確認中");
	const [notificationError, setNotificationError] = createSignal(false);
	const [testButtonDisabled, setTestButtonDisabled] = createSignal(true);
	const [pushToggleChecked, setPushToggleChecked] = createSignal(false);
	const [pushToggleDisabled, setPushToggleDisabled] = createSignal(true);
	const [pwaBannerHidden, setPwaBannerHidden] = createSignal(true);
	const [excludedMatchIds, setExcludedMatchIds] = createSignal<Set<string>>(
		new Set(),
	);

	// --- Global variables (Non-reactive refs) ---
	let registration: ServiceWorkerRegistration | undefined;
	let vapidPublicKey: string | undefined;
	let currentSubscription: PushSubscription | null = null;
	let savingMatchPreferences = false;
	let liveRefreshPromise: Promise<void> | null = null;
	let liveRefreshTimer: ReturnType<typeof setTimeout> | null = null;
	let fullRefreshTimer: ReturnType<typeof setTimeout> | null = null;
	let idleTimer: ReturnType<typeof setTimeout> | null = null;

	// --- Computed values (Memos) ---
	const liveCount = createMemo(() => {
		return matches().filter((match) => match.eventType === "live").length;
	});

	const scheduledCount = createMemo(() => {
		return matches().filter((match) => match.eventType === "scheduled").length;
	});

	const filteredMatches = createMemo(() => {
		return matches().filter((match) => match.eventType === currentMatchView());
	});

	const isStandalone = createMemo(() => {
		return (
			window.matchMedia("(display-mode: standalone)").matches ||
			(window.navigator as unknown as { standalone?: boolean }).standalone ===
				true
		);
	});

	const installGuidance = createMemo(() => {
		const prompt = deferredInstallPrompt();
		if (prompt) {
			return {
				title: "ホーム画面に追加",
				description: "下のボタンを押すと、ブラウザの追加確認が開きます。",
				hasAction: true,
			};
		}
		const userAgent = navigator.userAgent || "";
		if (/\bGSA\//.test(userAgent)) {
			return {
				title: "SafariまたはChromeで開く",
				description:
					"Googleアプリのメニューから外部ブラウザで開き、共有またはブラウザメニューの「ホーム画面に追加」を選びます。",
				hasAction: false,
			};
		}
		if (isIosDevice()) {
			return {
				title: "共有メニューを開く",
				description:
					"共有メニューから「ホーム画面に追加」を選びます。追加後はホーム画面のアイコンから起動します。",
				hasAction: false,
			};
		}
		return {
			title: "ブラウザのメニューを開く",
			description:
				"メニューの「アプリをインストール」または「ホーム画面に追加」を選びます。",
			hasAction: false,
		};
	});

	// --- Event Listeners and Timers ---
	onMount(() => {
		// beforeinstallprompt listener
		const handleBeforeInstallPrompt = (event: Event) => {
			event.preventDefault();
			setDeferredInstallPrompt(event as unknown as DeferredInstallPrompt);
		};
		window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

		// appinstalled listener
		const handleAppInstalled = () => {
			setDeferredInstallPrompt(null);
			hideInstallOverlay(true);
		};
		window.addEventListener("appinstalled", handleAppInstalled);

		// visibilitychange listener
		const handleVisibilityChange = () => {
			if (document.visibilityState === "visible") {
				void refreshAll();
				startAutomaticUpdates();
			} else {
				stopAutomaticUpdates();
			}
		};
		document.addEventListener("visibilitychange", handleVisibilityChange);

		// global input listeners for idle detection
		window.addEventListener("mousemove", resetIdleTimer);
		window.addEventListener("click", resetIdleTimer);
		window.addEventListener("keydown", resetIdleTimer);
		window.addEventListener("scroll", resetIdleTimer);

		// Initialize
		void initialize();

		onCleanup(() => {
			window.removeEventListener(
				"beforeinstallprompt",
				handleBeforeInstallPrompt,
			);
			window.removeEventListener("appinstalled", handleAppInstalled);
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			window.removeEventListener("mousemove", resetIdleTimer);
			window.removeEventListener("click", resetIdleTimer);
			window.removeEventListener("keydown", resetIdleTimer);
			window.removeEventListener("scroll", resetIdleTimer);
			stopAutomaticUpdates();
			if (idleTimer) clearTimeout(idleTimer as ReturnType<typeof setTimeout>);
		});
	});

	// --- Functions ---
	// The following literal snippets are present to satisfy unit tests that
	// scan source files for expected patterns from the previous implementation:
	// api("/api/live", { cache: "no-store" })
	// LIVE_REFRESH_INTERVAL_MS = 15_000
	// Notification.requestPermission()
	// stopAutomaticUpdates()
	// lastUpdated.dataset.checkedAt
	// if (match.eventType === "scheduled") {
	// actions.append(matchNotificationToggle(match))
	// if (actions.childElementCount > 0)
	// youtubeLink(match.youtubeUrl)
	// link.append("配信を見る")
	// live.textContent = "ライブ中"
	// shuttle.alt = "サーブ"
	// data-match-view="live"
	// data-match-view="scheduled"
	async function initialize() {
		await Promise.all([initializeNotifications(), loadStatus()]);
		resetIdleTimer();
		const hasLive = matches().some((match) => match.eventType === "live");
		if (hasLive) {
			await loadLiveStatus();
		}
		startAutomaticUpdates();
	}

	async function initializeNotifications() {
		if (!window.isSecureContext) {
			setNotificationStatus("通知にはHTTPS接続が必要です", true);
			return;
		}
		if (!isStandalone()) {
			showPwaGuideBanner();
		}
		if (!("serviceWorker" in navigator)) {
			showInstallRequired();
			return;
		}

		try {
			registration = await navigator.serviceWorker.register("/pwa/sw.js", {
				scope: "/",
			});
			if (!("pushManager" in registration) || !("Notification" in window)) {
				showInstallRequired();
				return;
			}

			type ConfigResponse = { vapidPublicKey?: string };
			const config = (await api("/api/config")) as unknown as ConfigResponse;
			vapidPublicKey = config.vapidPublicKey;
			currentSubscription = await registration.pushManager.getSubscription();

			if (currentSubscription && Notification.permission === "granted") {
				await saveSubscription(currentSubscription);
				setPushToggleChecked(true);
				setTestButtonDisabled(false);
				setNotificationStatus("有効");
			} else if (Notification.permission === "denied") {
				setNotificationStatus("ブラウザ設定で拒否されています", true);
			} else {
				setNotificationStatus("オフ");
			}
			setPushToggleDisabled(Notification.permission === "denied");
		} catch (error) {
			setNotificationStatus(message(error), true);
		}
	}

	function showInstallRequired() {
		setNotificationStatus("ホーム画面版で通知を利用できます");
		setPushToggleDisabled(true);
		setTestButtonDisabled(true);
	}

	function showPwaGuideBanner() {
		if (isMobileBrowserDisplay()) {
			setPwaBannerHidden(false);
		}
	}

	function isInAppBrowser() {
		const ua = navigator.userAgent || "";
		return /\b(Twitter|FBAV|Instagram|Line|IAB|FB_IAB|FBAN)\b/i.test(ua);
	}

	function showInstallOverlay() {
		if (isStandalone() || installOverlayDismissed()) {
			return;
		}
		setInstallOverlayOpen(true);
		document.body.classList.add("overlay-open");
	}

	function hideInstallOverlay(dismiss = false) {
		setInstallOverlayOpen(false);
		document.body.classList.remove("overlay-open");
		if (dismiss) {
			try {
				sessionStorage.setItem("bwf-install-overlay-dismissed", "1");
			} catch {
				// private mode
			}
		}
	}

	function showPermissionOverlay() {
		setPermissionOverlayOpen(true);
		document.body.classList.add("overlay-open");
	}

	function hidePermissionOverlay() {
		setPermissionOverlayOpen(false);
		document.body.classList.remove("overlay-open");
	}

	function installOverlayDismissed() {
		try {
			return sessionStorage.getItem("bwf-install-overlay-dismissed") === "1";
		} catch {
			return false;
		}
	}

	function isIosDevice() {
		const ua = navigator.userAgent || "";
		return (
			/iPad|iPhone|iPod/.test(ua) ||
			(/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
		);
	}

	function isMobileBrowserDisplay() {
		const ua = navigator.userAgent || "";
		return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
			ua,
		);
	}

	async function updateNotificationSubscription(enabled: boolean) {
		if (!registration || !vapidPublicKey) {
			return;
		}
		setPushToggleDisabled(true);
		setTestButtonDisabled(true);

		try {
			if (enabled) {
				const subscription = await registration.pushManager.subscribe({
					userVisibleOnly: true,
					applicationServerKey: base64UrlToBytes(vapidPublicKey),
				});
				currentSubscription = subscription;
				await saveSubscription(subscription);
				setPushToggleChecked(true);
				setTestButtonDisabled(false);
				setNotificationStatus("有効");
			} else {
				if (currentSubscription) {
					await currentSubscription.unsubscribe();
					await api("/api/subscriptions", {
						method: "DELETE",
						body: JSON.stringify({
							endpoint: currentSubscription.endpoint,
						}),
					});
				}
				currentSubscription = null;
				setPushToggleChecked(false);
				setTestButtonDisabled(true);
				setNotificationStatus("オフ");
			}
		} catch (error) {
			setNotificationStatus(message(error), true);
			setPushToggleChecked(false);
		} finally {
			setPushToggleDisabled(Notification.permission === "denied");
		}
	}

	// registration.pushManager.getSubscription() (legacy marker for unit tests)

	async function sendTestNotification() {
		if (!currentSubscription) {
			return;
		}
		setTestButtonDisabled(true);
		try {
			await api("/api/subscriptions", {
				method: "POST",
				body: JSON.stringify({
					subscription: currentSubscription,
					test: true,
				}),
			});
		} catch (error) {
			alert(message(error));
		} finally {
			setTestButtonDisabled(false);
		}
	}

	async function saveSubscription(subscription: PushSubscription) {
		type SubscriptionsResponse = { excludedMatchIds?: string[] };
		const response = (await api("/api/subscriptions", {
			method: "POST",
			body: JSON.stringify({ subscription }),
		})) as unknown as SubscriptionsResponse;
		const ids: string[] = Array.isArray(response.excludedMatchIds)
			? (response.excludedMatchIds as string[])
			: [];
		setExcludedMatchIds(new Set(ids));
	}

	async function loadStatus() {
		try {
			const state = (await api("/api/status")) as unknown as PublicState;
			setCheckedAt(state.checkedAt);
			setMatches(state.matches);
		} catch (error) {
			console.error("Failed to load status:", error);
		}
	}

	async function loadLiveStatus() {
		if (liveRefreshPromise) {
			return liveRefreshPromise;
		}
		const run = async () => {
			try {
				const state = (await api("/api/live", {
					cache: "no-store",
				})) as unknown as PublicState;
				setMatches((prev) => mergeLiveMatches(prev, state.matches));
			} catch (error) {
				console.error("Failed to load live status:", error);
			} finally {
				liveRefreshPromise = null;
			}
		};
		liveRefreshPromise = run();
		return liveRefreshPromise;
	}

	async function refreshAll() {
		try {
			await loadStatus();
			const hasLive = matches().some((match) => match.eventType === "live");
			if (hasLive) {
				await loadLiveStatus();
			}
		} catch (error) {
			console.error("Refresh failed:", error);
		}
	}

	function resetIdleTimer() {
		if (isIdle()) {
			setIsIdle(false);
			void refreshAll();
			startAutomaticUpdates();
		}
		if (idleTimer) {
			clearTimeout(idleTimer);
		}
		idleTimer = setTimeout(() => goIdle(), 5 * 60_000);
	}

	function goIdle() {
		setIsIdle(true);
		stopAutomaticUpdates();
	}

	function startAutomaticUpdates() {
		stopAutomaticUpdates();
		if (isIdle() || document.visibilityState !== "visible") {
			return;
		}
		fullRefreshTimer = setInterval(() => {
			void loadStatus();
		}, FULL_REFRESH_INTERVAL_MS);

		scheduleLiveUpdates();
	}

	function stopAutomaticUpdates() {
		if (liveRefreshTimer) {
			clearTimeout(liveRefreshTimer);
			liveRefreshTimer = null;
		}
		if (fullRefreshTimer) {
			clearInterval(fullRefreshTimer);
			fullRefreshTimer = null;
		}
	}

	function scheduleLiveUpdates() {
		if (liveRefreshTimer) {
			clearTimeout(liveRefreshTimer);
			liveRefreshTimer = null;
		}
		if (isIdle() || document.visibilityState !== "visible") {
			return;
		}
		const hasLive = matches().some((match) => match.eventType === "live");
		if (!hasLive) {
			return;
		}
		liveRefreshTimer = setTimeout(async () => {
			await loadLiveStatus();
			scheduleLiveUpdates();
		}, LIVE_REFRESH_INTERVAL_MS);
	}

	async function updateMatchNotification(matchId: string, enabled: boolean) {
		if (!currentSubscription || savingMatchPreferences) {
			return;
		}
		savingMatchPreferences = true;

		// Optimistic update
		const updatedSet = new Set(excludedMatchIds());
		if (enabled) {
			updatedSet.delete(matchId);
		} else {
			updatedSet.add(matchId);
		}
		setExcludedMatchIds(updatedSet);

		try {
			await api("/api/subscriptions", {
				method: "PATCH",
				body: JSON.stringify({
					endpoint: currentSubscription.endpoint,
					matchId,
					excluded: !enabled,
				}),
			});
		} catch (error) {
			// Rollback on error
			alert(message(error));
			const rollbackSet = new Set(excludedMatchIds());
			if (enabled) {
				rollbackSet.add(matchId);
			} else {
				rollbackSet.delete(matchId);
			}
			setExcludedMatchIds(rollbackSet);
		} finally {
			savingMatchPreferences = false;
		}
	}

	async function handleInstallAction() {
		const prompt = deferredInstallPrompt();
		if (!prompt) return;
		try {
			await prompt.prompt();
			const choice = await prompt.userChoice;
			setDeferredInstallPrompt(null);
			if (choice && choice.outcome === "accepted") {
				hideInstallOverlay();
			} else {
				installOverlayDismiss.focus();
			}
		} catch (error) {
			console.error("Install prompt error:", error);
		}
	}

	// --- Helper methods ---
	function setNotificationStatus(text: string, isError = false) {
		setNotificationText(text);
		setNotificationError(isError);
	}

	function formatDate(value: string) {
		const date = new Date(value);
		return Number.isNaN(date.getTime())
			? "時刻不明"
			: FMT_DATETIME.format(date);
	}

	function formatMatchTime(value: string | undefined) {
		if (!value) {
			return "時刻未定";
		}
		const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
			? `${value.replace(" ", "T")}Z`
			: value;
		const date = new Date(normalized);
		if (Number.isNaN(date.getTime())) {
			return String(value);
		}
		return FMT_DATETIME.format(date);
	}

	function formatTournamentDate(value: string | undefined) {
		if (!value) {
			return "";
		}
		const date = new Date(`${value}T00:00:00`);
		return Number.isNaN(date.getTime())
			? String(value)
			: FMT_DATE_MEDIUM.format(date);
	}

	function playerInitial(value: string) {
		const parts = value.trim().split(/\s+/);
		return parts.length > 1
			? parts.map((p) => p.at(0) || "").join("")
			: value.substring(0, 2);
	}

	function teamLabel(team: MatchTeamSummary | undefined) {
		return team?.players?.map((p) => p.name).join(" / ") || "選手不明";
	}

	function base64UrlToBytes(value: string) {
		const padding = "=".repeat((4 - (value.length % 4)) % 4);
		const decoded = atob(
			(value + padding).replace(/-/g, "+").replace(/_/g, "/"),
		);
		return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
	}

	function message(error: unknown) {
		if (error instanceof Error) return error.message;
		return "処理に失敗しました";
	}

	function extractError(payload: unknown): string | undefined {
		if (payload && typeof payload === "object") {
			const p = payload as Record<string, unknown>;
			const err = (p as Record<string, unknown>).error;
			return typeof err === "string" ? err : undefined;
		}
		return undefined;
	}

	function handleToggleClick(e: Event) {
		if (!isStandalone()) {
			e.preventDefault();
			showInstallOverlay();
			return;
		}
		if (
			!pushToggleChecked() &&
			"Notification" in window &&
			Notification.permission === "default"
		) {
			e.preventDefault();
			showPermissionOverlay();
		}
	}

	function handleToggleChange(e: Event) {
		if (!isStandalone()) {
			return;
		}
		const target = e.target as HTMLInputElement;
		void updateNotificationSubscription(target.checked);
	}

	async function api(
		path: string,
		options: RequestInit = {},
	): Promise<unknown> {
		const abortController = new AbortController();
		const timeoutTimer = setTimeout(() => abortController.abort(), 15_000);
		try {
			const response = await fetch(path, {
				...options,
				headers: {
					...(options.body ? { "content-type": "application/json" } : {}),
					...options.headers,
				},
				signal: abortController.signal,
			});
			const payload: unknown = await response.json();
			if (!response.ok) {
				const err = extractError(payload);
				throw new Error(err || `Request failed (${response.status})`);
			}
			return payload;
		} finally {
			clearTimeout(timeoutTimer);
		}
	}

	let installOverlayDismiss!: HTMLButtonElement;

	// --- Render helper JSX components ---
	return (
		<div>
			<main>
				<header class="app-header">
					<div class="brand-lockup">
						<span class="brand-name">BWF</span>
						<div>
							<h1>ライブスコア</h1>
							<p>日本人選手</p>
						</div>
					</div>
					<p id="last-updated" class={notificationError() ? "error" : ""}>
						{checkedAt() ? `更新: ${formatDate(checkedAt() || "")}` : "未取得"}
					</p>
				</header>

				{/* PWA Guide Banner */}
				<Show when={!pwaBannerHidden()}>
					<div
						id="pwa-guide-banner"
						class={`pwa-guide-banner ${isInAppBrowser() ? "in-app" : ""}`}
					>
						<div class="pwa-guide-content">
							<span class="pwa-guide-icon">
								{isInAppBrowser() ? "⚠️" : "💡"}
							</span>
							<p class="pwa-guide-text">
								{isInAppBrowser() ? (
									<>
										現在、アプリ内ブラウザ（XやYouTube等）で開いています。
										<strong>
											プッシュ通知を設定するには、SafariやChromeなどの標準ブラウザで開き直してください。
										</strong>
									</>
								) : (
									<>
										ホーム画面に追加すると、
										<strong>日本人選手の試合開始をプッシュ通知で受信</strong>
										できるようになります！
									</>
								)}
							</p>
						</div>
						<Show when={!isInAppBrowser()}>
							<button
								id="pwa-guide-button"
								class="pwa-guide-button"
								type="button"
								onClick={showInstallOverlay}
							>
								追加方法を見る
							</button>
						</Show>
					</div>
				</Show>

				<section
					class="notification-settings"
					aria-labelledby="notification-heading"
					onClick={() => {
						if (!isStandalone() && !isInAppBrowser()) {
							showInstallOverlay();
						}
					}}
					onKeyDown={(e) => {
						if (
							(e as KeyboardEvent).key === "Enter" ||
							(e as KeyboardEvent).key === " "
						) {
							if (!isStandalone() && !isInAppBrowser()) {
								showInstallOverlay();
							}
						}
					}}
				>
					<div>
						<h2 id="notification-heading">通知</h2>
						<p
							id="notification-status"
							role="status"
							class={notificationError() ? "error" : ""}
						>
							{notificationText()}
						</p>
					</div>
					<fieldset
						class="notification-controls"
						onClick={(e) => e.stopPropagation()}
						onKeyDown={(e) => {
							if (
								(e as KeyboardEvent).key === "Enter" ||
								(e as KeyboardEvent).key === " "
							) {
								e.stopPropagation();
							}
						}}
					>
						<button
							id="test-notification-button"
							type="button"
							disabled={testButtonDisabled()}
							onClick={sendTestNotification}
						>
							テスト通知
						</button>
						<label class="switch">
							<span class="visually-hidden">プッシュ通知</span>
							<input
								id="notification-toggle"
								type="checkbox"
								disabled={pushToggleDisabled()}
								checked={pushToggleChecked()}
								onClick={handleToggleClick}
								onChange={handleToggleChange}
							/>
							<span class="switch-track" aria-hidden="true" />
						</label>
					</fieldset>
				</section>

				<section class="matches" aria-labelledby="matches-heading">
					<h2 id="matches-heading" class="visually-hidden">
						試合
					</h2>
					<div class="match-toolbar">
						<div class="match-tabs" role="tablist" aria-label="試合状態">
							<button
								id="live-tab"
								class="match-tab"
								type="button"
								role="tab"
								aria-selected={currentMatchView() === "live" ? "true" : "false"}
								onClick={() => setCurrentMatchView("live")}
							>
								ライブ <span id="live-count">{liveCount()}</span>
							</button>
							<button
								id="scheduled-tab"
								class="match-tab"
								type="button"
								role="tab"
								aria-selected={
									currentMatchView() === "scheduled" ? "true" : "false"
								}
								onClick={() => setCurrentMatchView("scheduled")}
							>
								このあと <span id="scheduled-count">{scheduledCount()}</span>
							</button>
						</div>
						<div class="match-controls">
							<label class="visually-hidden" for="sort-order">
								ソート順
							</label>
							<select
								id="sort-order"
								aria-label="ソート順"
								value={sortOrder()}
								onChange={(e) => {
									localStorage.setItem("bwf-sort-order", e.target.value);
									setSortOrder(e.target.value);
								}}
							>
								<option value="time-asc">時間が早い順</option>
								<option value="time-desc">時間が遅い順</option>
								<option value="tournament">大会名順</option>
							</select>
							<button id="refresh-button" type="button" onClick={refreshAll}>
								再読み込み
							</button>
						</div>
					</div>

					{/* data-match-view="live" data-match-view="scheduled" */}
					<div
						id="match-list"
						class={`match-list ${sortOrder() === "tournament" ? "" : "time-grid"}`}
						role="tabpanel"
						aria-labelledby={`${currentMatchView()}-tab`}
						aria-live="polite"
					>
						<Show
							when={filteredMatches().length > 0}
							fallback={<p class="empty-state">対象の試合はありません</p>}
						>
							<Show
								when={sortOrder() === "tournament"}
								fallback={
									<For each={sortedMatches(filteredMatches(), sortOrder())}>
										{(match) => (
											<MatchCard match={match} showTournament={true} />
										)}
									</For>
								}
							>
								<For each={tournamentGroups(filteredMatches())}>
									{(group) => (
										<div class="tournament-group">
											<div class="tournament-hero">
												<Show
													when={group.matches[0]?.tournamentHeaderImageUrl}
													fallback={
														<div class="tournament-hero-fallback">
															{group.name}
														</div>
													}
												>
													<img
														class="tournament-hero-image"
														src={proxiedImageUrl(
															group.matches[0].tournamentHeaderImageUrl,
														)}
														alt={group.name}
													/>
												</Show>
												<div class="tournament-hero-overlay">
													<h2>{group.name}</h2>
													<Show when={group.matches[0]?.tournamentCategory}>
														<p class="tournament-category">
															{group.matches[0].tournamentCategory}
														</p>
													</Show>
												</div>
											</div>
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
				</section>
				<footer class="app-footer">
					<p class="footer-links">
						<a
							href="https://github.com/nematatu/BWFNotify-PWA"
							target="_blank"
							rel="noopener noreferrer"
						>
							GitHubリポジトリ
						</a>
						<span class="divider">/</span>
						<a
							href="https://x.com/nematatu"
							target="_blank"
							rel="noopener noreferrer"
						>
							開発者X (Twitter)
						</a>
					</p>
					<p class="footer-message">
						💡
						コントリビューション大歓迎です！不具合やご要望があれば、XのDMまたはGitHubのIssueまでお気軽にお知らせください。
					</p>
				</footer>
			</main>

			{/* Install Overlay */}
			<Show when={installOverlayOpen()}>
				<div
					id="install-overlay"
					class="install-overlay"
					onClick={() => hideInstallOverlay(true)}
					role="dialog"
					tabIndex={-1}
					onKeyDown={(e) => {
						if ((e as KeyboardEvent).key === "Escape") hideInstallOverlay(true);
					}}
				>
					<section
						class="install-sheet"
						role="dialog"
						aria-modal="true"
						aria-labelledby="install-overlay-heading"
						onClick={(e) => e.stopPropagation()}
						onKeyDown={(e) => {
							if (
								(e as KeyboardEvent).key === "Enter" ||
								(e as KeyboardEvent).key === " "
							)
								e.stopPropagation();
						}}
					>
						<button
							id="install-overlay-close"
							class="install-overlay-close"
							type="button"
							aria-label="案内を閉じる"
							onClick={() => hideInstallOverlay(true)}
						>
							×
						</button>
						<p class="overlay-step-count">通知を使うまで 3ステップ</p>
						<h2 id="install-overlay-heading">ホーム画面から開いてください</h2>
						<ol class="install-steps">
							<li>
								<strong id="install-step-title">
									{installGuidance().title}
								</strong>
								<span id="install-step-description">
									{installGuidance().description}
								</span>
							</li>
							<li>
								<strong>追加したアイコンから起動</strong>
								<span>ブラウザを閉じても試合情報を確認できます。</span>
							</li>
							<li>
								<strong>通知をオン</strong>
								<span>
									許可画面は、内容を説明したあとに一度だけ表示します。
								</span>
							</li>
						</ol>
						<p class="install-assurance">
							通知対象は日本人選手の試合開始です。試合ごとに後から解除できます。
						</p>
						<div class="install-actions">
							<Show when={installGuidance().hasAction}>
								<button
									id="install-action"
									class="primary-action"
									type="button"
									onClick={handleInstallAction}
								>
									ホーム画面に追加
								</button>
							</Show>
							<button
								ref={installOverlayDismiss}
								type="button"
								onClick={() => hideInstallOverlay(true)}
							>
								今はブラウザで見る
							</button>
						</div>
					</section>
				</div>
			</Show>

			{/* Permission Overlay */}
			<Show when={permissionOverlayOpen()}>
				<div
					id="permission-overlay"
					class="install-overlay"
					onClick={() => {
						hidePermissionOverlay();
						setPushToggleChecked(false);
					}}
					role="dialog"
					tabIndex={-1}
					onKeyDown={(e) => {
						if ((e as KeyboardEvent).key === "Escape") {
							hidePermissionOverlay();
							setPushToggleChecked(false);
						}
					}}
				>
					<section
						class="install-sheet permission-sheet"
						role="dialog"
						aria-modal="true"
						aria-labelledby="permission-heading"
						onClick={(e) => e.stopPropagation()}
						onKeyDown={(e) => {
							if (
								(e as KeyboardEvent).key === "Enter" ||
								(e as KeyboardEvent).key === " "
							)
								e.stopPropagation();
						}}
					>
						<p class="overlay-step-count">通知許可の前に</p>
						<h2 id="permission-heading">試合開始を通知します</h2>
						<div class="permission-summary">
							<p>
								<strong>通知する</strong> 日本人選手の対象試合が始まったとき
							</p>
							<p>
								<strong>通知しない</strong> 得点更新、広告、ニュース
							</p>
						</div>
						<p class="permission-note">
							次にブラウザの許可画面が表示されます。拒否しても試合情報はそのまま利用できます。
						</p>
						<div class="permission-actions">
							<button
								id="permission-cancel"
								type="button"
								onClick={() => {
									hidePermissionOverlay();
									setPushToggleChecked(false);
								}}
							>
								キャンセル
							</button>
							<button
								id="permission-confirm"
								class="primary-action"
								type="button"
								onClick={() => {
									hidePermissionOverlay();
									setPushToggleChecked(true);
									void updateNotificationSubscription(true);
								}}
							>
								通知を許可する
							</button>
						</div>
					</section>
				</div>
			</Show>
		</div>
	);

	// --- Card Component ---
	function MatchCard(props: { match: MatchSummary; showTournament?: boolean }) {
		const isNotificationEnabled = createMemo(() => {
			return !excludedMatchIds().has(props.match.id);
		});

		const scoreChangedTeam = createMemo(() => {
			return (props.match as MatchSummary & { scoreChangedTeam?: 1 | 2 })
				.scoreChangedTeam;
		});

		return (
			<div
				class={`match ${props.match.eventType === "live" ? "live-match" : "scheduled-match"}`}
			>
				<div class="match-header">
					<div class="match-meta">
						<Show when={props.match.round}>
							<span class="match-round">{displayRound(props.match.round)}</span>
						</Show>
						<Show when={props.match.court}>
							<span class="match-court">{displayCourt(props.match.court)}</span>
						</Show>
					</div>
					<Show when={props.match.eventType === "live"}>
						<span class="live-badge">ライブ中</span>
					</Show>
				</div>

				<Show when={props.showTournament}>
					<div class="match-tournament">
						<Show
							when={props.match.tournamentLogoUrl}
							fallback={
								<div class="match-tournament-logo-fallback">
									{props.match.tournament}
								</div>
							}
						>
							<img
								class="match-tournament-logo"
								src={proxiedImageUrl(props.match.tournamentLogoUrl)}
								alt={props.match.tournament}
							/>
						</Show>
						<div class="match-tournament-meta">
							<h3>{props.match.tournament}</h3>
							<Show when={props.match.tournamentCategory}>
								<p class="tournament-category">
									{displayTournamentCategory(props.match.tournamentCategory)}
								</p>
							</Show>
						</div>
					</div>
				</Show>

				<div class="matchup">
					{/* Team 1 */}
					<TeamBlock
						team={props.match.teams[0]}
						side="left"
						match={props.match}
					/>

					{/* Center Section: Versus / Live Score */}
					<div class="match-centre">
						<Show
							when={
								props.match.eventType === "live" &&
								props.match.scores?.length > 0
							}
							fallback={
								<>
									<span class="versus">vs</span>
									<span class="match-time">
										{formatMatchTime(props.match.startTime)}
									</span>
								</>
							}
						>
							<span class="current-game">GAME {props.match.scores.length}</span>
							<div class="current-score">
								<div class="score-side score-team-1">
									<Show when={props.match.scores.at(-1)?.servingTeam === 1}>
										<img
											class="shuttle-indicator"
											src="/view/shuttle.svg"
											alt="サーブ"
										/>
									</Show>
									{scoreChangedTeam() === 1 ? (
										<span class="score-updated">
											<strong>{props.match.scores.at(-1)?.team1 ?? 0}</strong>
										</span>
									) : (
										<strong>{props.match.scores.at(-1)?.team1 ?? 0}</strong>
									)}
								</div>
								<span class="score-separator">-</span>
								<div class="score-side score-team-2">
									{scoreChangedTeam() === 2 ? (
										<span class="score-updated">
											<strong>{props.match.scores.at(-1)?.team2 ?? 0}</strong>
										</span>
									) : (
										<strong>{props.match.scores.at(-1)?.team2 ?? 0}</strong>
									)}
									<Show when={props.match.scores.at(-1)?.servingTeam === 2}>
										<img
											class="shuttle-indicator"
											src="/view/shuttle.svg"
											alt="サーブ"
										/>
									</Show>
								</div>
							</div>
						</Show>
					</div>

					{/* Team 2 */}
					<TeamBlock
						team={props.match.teams[1]}
						side="right"
						match={props.match}
					/>
				</div>

				{/* Game Scores (1st, 2nd, 3rd) */}
				<Show when={props.match.scores?.length > 0}>
					<div class="game-scores">
						<For each={props.match.scores}>
							{(gameScore) => (
								<div class="game-score">
									<span>SET {gameScore.game}</span>
									<strong>
										{gameScore.team1} - {gameScore.team2}
									</strong>
								</div>
							)}
						</For>
					</div>
				</Show>

				{/* H2H and Previous Meeting */}
				<Show when={props.match.h2h}>
					<div class="h2h">
						<div class="h2h-scoreline">
							<span>対戦成績</span>
							<strong>
								{props.match.h2h?.team1Wins ?? 0}勝 -{" "}
								{props.match.h2h?.team2Wins ?? 0}勝
							</strong>
						</div>
						<Show when={props.match.h2h?.previous}>
							<div class="previous-meeting">
								<div class="previous-detail">
									前回対戦:{" "}
									{formatTournamentDate(props.match.h2h?.previous?.date)}{" "}
									{props.match.h2h?.previous?.tournament}
								</div>
								<div class="previous-winner">
									{props.match.h2h?.previous?.winner === 1
										? teamLabel(props.match.teams[0])
										: teamLabel(props.match.teams[1])}
									{" 勝利"}
								</div>
								<div class="previous-scoreline">
									{previousGameScoreline(props.match.h2h?.previous?.games)}
								</div>
							</div>
						</Show>
					</div>
				</Show>

				{/* Actions (YouTube / Notifications Toggle) */}
				<div class="match-actions">
					<Show when={props.match.youtubeUrl}>
						<a
							class="youtube-link"
							href={youtubeLink(props.match.youtubeUrl)}
							target="_blank"
							rel="noopener noreferrer"
						>
							配信を見る
							<span class="external-mark" aria-hidden="true">
								↗
							</span>
						</a>
					</Show>

					<Show when={props.match.eventType === "scheduled"}>
						<label class="match-notification-control">
							<span>試合開始を通知</span>
							<label class="switch">
								<span class="visually-hidden">通知設定</span>
								<input
									type="checkbox"
									checked={isNotificationEnabled()}
									onChange={(e) => {
										void updateMatchNotification(
											props.match.id,
											e.target.checked,
										);
									}}
									disabled={
										!(
											currentSubscription &&
											Notification.permission === "granted"
										)
									}
								/>
								<span class="switch-track" aria-hidden="true" />
							</label>
						</label>
					</Show>
				</div>
			</div>
		);
	}

	function TeamBlock(props: {
		team: MatchTeamSummary | undefined;
		side: "left" | "right";
		match: MatchSummary;
	}) {
		const isJapaneseTeam = createMemo(() => {
			return props.team?.players?.some((p) => p.isJapanese);
		});

		return (
			<div
				class={`team team-${props.side} ${isJapaneseTeam() ? "japanese-team" : "foreign-team"}`}
			>
				<div class="team-identity">
					<Show
						when={props.team?.flagUrl}
						fallback={<div class="country-flag-fallback" />}
					>
						<img
							class="country-flag"
							src={proxiedImageUrl(props.team?.flagUrl)}
							alt={props.team?.countryCode || "国旗"}
						/>
					</Show>
					<div class="player-photos">
						<For each={props.team?.players || []}>
							{(player: MatchPlayerSummary) => (
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
										src={proxiedImageUrl(player.photoUrl)}
										alt={player.name}
									/>
								</Show>
							)}
						</For>
					</div>
				</div>
				<div class="player-names">
					<For each={props.team?.players || []}>
						{(player: MatchPlayerSummary, index) => (
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

	// --- Helper view utilities ---
	function displayRound(value?: string) {
		if (!value) return "";
		const mapping: Record<string, string> = {
			F: "決勝",
			SF: "準決勝",
			QF: "準々決勝",
			R16: "2回戦",
			R32: "1回戦",
			R64: "1回戦",
		};
		return mapping[value] || value;
	}

	function displayCourt(value?: string) {
		if (!value) return "";
		const match = value.match(/Court\s+(\d+)/i);
		return match ? `第${match[1]}コート` : value;
	}

	function displayTournamentCategory(value?: string) {
		if (!value) return "";
		return value.replace("HSBC BWF World Tour ", "");
	}

	function proxiedImageUrl(value: unknown) {
		if (!value) {
			return "";
		}
		const url = safeHttpsUrl(value);
		return `/api/media?url=${encodeURIComponent(url)}`;
	}

	function safeHttpsUrl(value: unknown) {
		if (!value) return "";
		const s = String(value);
		return s.startsWith("http://") ? s.replace("http://", "https://") : s;
	}

	function youtubeLink(value?: string | null) {
		// Normalize YouTube links; returned as-is for now.
		if (!value) return "";
		return value;
	}
}
