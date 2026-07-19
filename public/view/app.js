import {
	DEFAULT_SORT_ORDER,
	mergeLiveMatches,
	previousGameScoreline,
	sortedMatches,
	tournamentGroups,
} from "./match-groups.js?v=42";

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

const toggle = document.querySelector("#notification-toggle");
const notificationStatus = document.querySelector("#notification-status");
const testNotificationButton = document.querySelector(
	"#test-notification-button",
);
const installOverlay = document.querySelector("#install-overlay");
const installOverlayClose = document.querySelector("#install-overlay-close");
const installOverlayDismiss = document.querySelector(
	"#install-overlay-dismiss",
);
const installAction = document.querySelector("#install-action");
const installStepTitle = document.querySelector("#install-step-title");
const installStepDescription = document.querySelector(
	"#install-step-description",
);
const permissionOverlay = document.querySelector("#permission-overlay");
const permissionCancel = document.querySelector("#permission-cancel");
const permissionConfirm = document.querySelector("#permission-confirm");
const lastUpdated = document.querySelector("#last-updated");
const matchList = document.querySelector("#match-list");
const refreshButton = document.querySelector("#refresh-button");
const sortOrderSelect = document.querySelector("#sort-order");
const matchTabs = [...document.querySelectorAll("[data-match-view]")];
const liveCount = document.querySelector("#live-count");
const scheduledCount = document.querySelector("#scheduled-count");
const pwaGuideBanner = document.querySelector("#pwa-guide-banner");
const pwaGuideButton = document.querySelector("#pwa-guide-button");
const notificationSettings = document.querySelector(".notification-settings");

let registration;
let vapidPublicKey;
let currentMatches = [];
let currentSubscription = null;
let excludedMatchIds = new Set();
let savingMatchPreferences = false;
let currentMatchView = "live";
let viewSelectedByUser = false;
let deferredInstallPrompt = null;
let liveCheckedAt = null;
let liveRefreshPromise = null;
let liveRefreshTimer = null;
let fullRefreshTimer = null;

window.addEventListener("beforeinstallprompt", (event) => {
	event.preventDefault();
	deferredInstallPrompt = event;
	configureInstallGuidance();
});

window.addEventListener("appinstalled", () => {
	deferredInstallPrompt = null;
	hideInstallOverlay(true);
});

toggle.addEventListener("change", () => {
	if (
		toggle.checked &&
		"Notification" in window &&
		Notification.permission === "default"
	) {
		toggle.checked = false;
		showPermissionOverlay();
		return;
	}
	void updateNotificationSubscription(toggle.checked);
});

refreshButton.addEventListener("click", () => {
	void refreshAll();
});

sortOrderSelect.addEventListener("change", () => {
	localStorage.setItem("bwf-sort-order", sortOrderSelect.value);
	renderCurrentMatches();
});

testNotificationButton.addEventListener("click", () => {
	void sendTestNotification();
});

for (const tab of matchTabs) {
	tab.addEventListener("click", () => {
		currentMatchView = tab.dataset.matchView;
		viewSelectedByUser = true;
		renderCurrentMatches();
	});
}

for (const control of [installOverlayClose, installOverlayDismiss]) {
	control.addEventListener("click", () => hideInstallOverlay(true));
}

installAction.addEventListener("click", async () => {
	if (!deferredInstallPrompt) {
		return;
	}
	installAction.disabled = true;
	try {
		await deferredInstallPrompt.prompt();
		const choice = await deferredInstallPrompt.userChoice;
		deferredInstallPrompt = null;
		if (choice.outcome === "accepted") {
			hideInstallOverlay();
		} else {
			configureInstallGuidance();
			installOverlayDismiss.focus();
		}
	} finally {
		installAction.disabled = false;
	}
});

installOverlay.addEventListener("click", (event) => {
	if (event.target === installOverlay) {
		hideInstallOverlay(true);
	}
});

installOverlay.addEventListener("keydown", (event) => {
	const controls = [installOverlayClose];
	if (!installAction.hidden) {
		controls.push(installAction);
	}
	controls.push(installOverlayDismiss);
	trapOverlayFocus(event, controls, () => hideInstallOverlay(true));
});

permissionCancel.addEventListener("click", () => {
	hidePermissionOverlay();
	toggle.checked = false;
});

permissionConfirm.addEventListener("click", () => {
	hidePermissionOverlay();
	toggle.checked = true;
	void updateNotificationSubscription(true);
});

permissionOverlay.addEventListener("keydown", (event) => {
	trapOverlayFocus(event, [permissionCancel, permissionConfirm], () => {
		hidePermissionOverlay();
		toggle.checked = false;
	});
});

document.addEventListener("visibilitychange", () => {
	if (document.visibilityState === "visible") {
		void refreshAll();
		startAutomaticUpdates();
	} else {
		stopAutomaticUpdates();
	}
});

void initialize();

async function initialize() {
	configureInstallGuidance();
	const savedSortOrder = localStorage.getItem("bwf-sort-order");
	sortOrderSelect.value = ["time-asc", "time-desc", "tournament"].includes(
		savedSortOrder,
	)
		? savedSortOrder
		: DEFAULT_SORT_ORDER;
	await Promise.all([initializeNotifications(), loadStatus()]);
	resetIdleTimer();
	const hasLiveMatches = currentMatches.some(
		(match) => match.eventType === "live",
	);
	if (hasLiveMatches) {
		await loadLiveStatus();
	}
	startAutomaticUpdates();
}

function configureInstallGuidance() {
	if (deferredInstallPrompt) {
		installStepTitle.textContent = "ホーム画面に追加";
		installStepDescription.textContent =
			"下のボタンを押すと、ブラウザの追加確認が開きます。";
		installAction.hidden = false;
		return;
	}

	installAction.hidden = true;
	const userAgent = navigator.userAgent;
	if (/\bGSA\//.test(userAgent)) {
		installStepTitle.textContent = "SafariまたはChromeで開く";
		installStepDescription.textContent =
			"Googleアプリのメニューから外部ブラウザで開き、共有またはブラウザメニューの「ホーム画面に追加」を選びます。";
		return;
	}
	if (isIosDevice()) {
		installStepTitle.textContent = "共有メニューを開く";
		installStepDescription.textContent =
			"共有メニューから「ホーム画面に追加」を選びます。追加後はホーム画面のアイコンから起動します。";
		return;
	}

	installStepTitle.textContent = "ブラウザのメニューを開く";
	installStepDescription.textContent =
		"メニューの「アプリをインストール」または「ホーム画面に追加」を選びます。";
}

async function initializeNotifications() {
	if (!window.isSecureContext) {
		setNotificationStatus("通知にはHTTPS接続が必要です", true);
		return;
	}
	if (!isStandaloneDisplay()) {
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

		const config = await api("/api/config");
		vapidPublicKey = config.vapidPublicKey;
		const subscription = await registration.pushManager.getSubscription();
		if (subscription && Notification.permission === "granted") {
			await saveSubscription(subscription);
			toggle.checked = true;
			testNotificationButton.disabled = false;
			setNotificationStatus("有効");
		} else if (Notification.permission === "denied") {
			setNotificationStatus("ブラウザ設定で拒否されています", true);
		} else {
			setNotificationStatus("オフ");
		}
		toggle.disabled = Notification.permission === "denied";
	} catch (error) {
		setNotificationStatus(message(error), true);
	}
}

function showInstallRequired() {
	setNotificationStatus("ホーム画面版で通知を利用できます");
	toggle.disabled = true;
	testNotificationButton.disabled = true;
}

function showPwaGuideBanner() {
	if (isMobileBrowserDisplay()) {
		pwaGuideBanner.hidden = false;
		if (isInAppBrowser()) {
			pwaGuideBanner.classList.add("in-app");
			pwaGuideBanner.querySelector(".pwa-guide-icon").textContent = "⚠️";
			pwaGuideBanner.querySelector(".pwa-guide-text").innerHTML =
				"現在、アプリ内ブラウザ（XやYouTube等）で開いています。<strong>プッシュ通知を設定するには、SafariやChromeなどの標準ブラウザで開き直してください。</strong>";
			pwaGuideButton.hidden = true;
		} else {
			pwaGuideButton.addEventListener("click", () => showInstallOverlay());
			if (notificationSettings) {
				notificationSettings.addEventListener("click", () => {
					showInstallOverlay();
				});
			}
		}
	}
}

function isInAppBrowser() {
	const ua = navigator.userAgent || "";
	return /\b(Twitter|FBAV|Instagram|Line|IAB|FB_IAB|FBAN)\b/i.test(ua);
}

function showInstallOverlay() {
	if (isStandaloneDisplay() || installOverlayDismissed()) {
		return;
	}
	installOverlay.hidden = false;
	document.body.classList.add("overlay-open");
	installOverlayClose.focus();
}

function hideInstallOverlay(dismiss = false) {
	installOverlay.hidden = true;
	document.body.classList.remove("overlay-open");
	if (dismiss) {
		try {
			sessionStorage.setItem("bwf-install-overlay-dismissed", "1");
		} catch {
			// Storage may be unavailable in private browsing contexts.
		}
	}
}

function showPermissionOverlay() {
	permissionOverlay.hidden = false;
	document.body.classList.add("overlay-open");
	permissionConfirm.focus();
}

function hidePermissionOverlay() {
	permissionOverlay.hidden = true;
	document.body.classList.remove("overlay-open");
}

function trapOverlayFocus(event, controls, close) {
	if (event.key === "Escape") {
		event.preventDefault();
		close();
		return;
	}
	if (event.key !== "Tab") {
		return;
	}
	event.preventDefault();
	const currentIndex = controls.indexOf(document.activeElement);
	const direction = event.shiftKey ? -1 : 1;
	const nextIndex =
		(currentIndex + direction + controls.length) % controls.length;
	controls[nextIndex].focus();
}

function installOverlayDismissed() {
	try {
		return sessionStorage.getItem("bwf-install-overlay-dismissed") === "1";
	} catch {
		return false;
	}
}

function isStandaloneDisplay() {
	return (
		window.matchMedia("(display-mode: standalone)").matches ||
		window.navigator.standalone === true
	);
}

function isIosDevice() {
	return (
		/iPad|iPhone|iPod/.test(navigator.userAgent) ||
		(navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
	);
}

function isMobileBrowserDisplay() {
	return (
		!isStandaloneDisplay() && window.matchMedia("(pointer: coarse)").matches
	);
}

async function updateNotificationSubscription(enabled) {
	toggle.disabled = true;
	try {
		if (!registration || !vapidPublicKey) {
			throw new Error("通知設定を読み込めませんでした");
		}

		if (enabled) {
			const permission = await Notification.requestPermission();
			if (permission !== "granted") {
				throw new Error("通知が許可されていません");
			}
			const current = await registration.pushManager.getSubscription();
			const subscription =
				current ||
				(await registration.pushManager.subscribe({
					userVisibleOnly: true,
					applicationServerKey: base64UrlToBytes(vapidPublicKey),
				}));
			await saveSubscription(subscription);
			testNotificationButton.disabled = false;
			setNotificationStatus("有効");
		} else {
			const current = await registration.pushManager.getSubscription();
			if (current) {
				await api("/api/subscriptions", {
					method: "DELETE",
					body: JSON.stringify({ endpoint: current.endpoint }),
				});
				await current.unsubscribe();
			}
			currentSubscription = null;
			excludedMatchIds = new Set();
			renderCurrentMatches();
			testNotificationButton.disabled = true;
			setNotificationStatus("オフ");
		}
	} catch (error) {
		toggle.checked = !enabled;
		setNotificationStatus(message(error), true);
	} finally {
		toggle.disabled = Notification.permission === "denied";
		testNotificationButton.disabled = !toggle.checked;
	}
}

async function sendTestNotification() {
	testNotificationButton.disabled = true;
	try {
		if (!registration || Notification.permission !== "granted") {
			throw new Error("先に通知を有効にしてください");
		}
		const match = currentMatches.find((item) => item.eventType === "live");
		const imageUrl = match
			? match.teams
					.find((team) => team.players.some((player) => player.isJapanese))
					?.players.find((player) => player.isJapanese)?.photoUrl
			: undefined;
		const notificationImage = proxiedImageUrl(imageUrl);
		const options = {
			body: "通知は正常に表示できます",
			icon: notificationImage || "/pwa/icons/icon-192.png",
			...(notificationImage ? { image: notificationImage } : {}),
			tag: `bwf-test-${Date.now()}`,
			data: { url: match?.youtubeUrl || "/" },
		};

		try {
			const notification = new Notification("BWF 通知テスト", options);
			notification.onclick = () => window.focus();
		} catch {
			const readyRegistration = await navigator.serviceWorker.ready;
			await readyRegistration.showNotification("BWF 通知テスト", {
				...options,
				badge: "/pwa/icons/icon-192.png",
			});
		}
		setNotificationStatus("テスト通知を表示しました");
	} catch (error) {
		setNotificationStatus(message(error), true);
	} finally {
		testNotificationButton.disabled = !toggle.checked;
	}
}

async function saveSubscription(subscription) {
	const result = await api("/api/subscriptions", {
		method: "POST",
		body: JSON.stringify(subscription),
	});
	currentSubscription = subscription;
	excludedMatchIds = new Set(result.excludedMatchIds || []);
	renderCurrentMatches();
}

async function loadStatus() {
	refreshButton.disabled = true;
	try {
		const state = await api("/api/status");
		const storedMatches = Array.isArray(state.matches) ? state.matches : [];
		currentMatches = isNewerTimestamp(liveCheckedAt, state.checkedAt)
			? mergeLiveMatches(
					storedMatches,
					currentMatches.filter((match) => match.eventType === "live"),
				)
			: storedMatches;
		const hasLiveMatches = currentMatches.some(
			(match) => match.eventType === "live",
		);
		if (!viewSelectedByUser && !hasLiveMatches) {
			currentMatchView = "scheduled";
		}
		renderCurrentMatches();
		lastUpdated.textContent = state.checkedAt
			? `${formatDate(state.checkedAt)} 更新`
			: "次回チェック待ち";
		lastUpdated.dataset.checkedAt = state.checkedAt || "";
		lastUpdated.classList.remove("error");
	} catch (error) {
		lastUpdated.textContent = message(error);
		lastUpdated.classList.add("error");
	} finally {
		refreshButton.disabled = false;
	}
}

async function loadLiveStatus() {
	if (document.visibilityState !== "visible") {
		return;
	}
	if (liveRefreshPromise) {
		return liveRefreshPromise;
	}
	liveRefreshPromise = (async () => {
		try {
			const state = await api("/api/live", { cache: "no-store" });
			const matches = Array.isArray(state.matches) ? state.matches : [];
			currentMatches = mergeLiveMatches(currentMatches, matches);
			liveCheckedAt = state.checkedAt || new Date().toISOString();
			if (!viewSelectedByUser && matches.length > 0) {
				currentMatchView = "live";
			}
			renderCurrentMatches();
			lastUpdated.textContent = `${formatDate(liveCheckedAt)} 更新`;
			lastUpdated.dataset.checkedAt = liveCheckedAt;
			lastUpdated.classList.remove("error");
		} catch (error) {
			console.error("Live score refresh failed", error);
		}
	})().finally(() => {
		liveRefreshPromise = null;
	});
	return liveRefreshPromise;
}

async function refreshAll() {
	await loadStatus();
	const hasLiveMatches = currentMatches.some(
		(match) => match.eventType === "live",
	);
	if (hasLiveMatches) {
		await loadLiveStatus();
	}
}

let idleTimer = null;
let isIdle = false;
const IDLE_TIMEOUT_MS = 5 * 60_000; // 5 minutes

function resetIdleTimer() {
	if (isIdle) {
		isIdle = false;
		startAutomaticUpdates();
		void refreshAll();
	}
	if (idleTimer != null) {
		window.clearTimeout(idleTimer);
	}
	idleTimer = window.setTimeout(goIdle, IDLE_TIMEOUT_MS);
}

function goIdle() {
	isIdle = true;
	stopAutomaticUpdates();
}

// Register user activity listeners
for (const eventName of [
	"mousemove",
	"keydown",
	"click",
	"scroll",
	"touchstart",
]) {
	window.addEventListener(eventName, resetIdleTimer, { passive: true });
}

function startAutomaticUpdates() {
	stopAutomaticUpdates();
	if (document.visibilityState !== "visible" || isIdle) {
		return;
	}
	fullRefreshTimer = window.setInterval(
		() => void refreshAll(),
		FULL_REFRESH_INTERVAL_MS,
	);
	scheduleLiveUpdates();
}

function stopAutomaticUpdates() {
	if (liveRefreshTimer != null) {
		window.clearInterval(liveRefreshTimer);
		liveRefreshTimer = null;
	}
	if (fullRefreshTimer != null) {
		window.clearInterval(fullRefreshTimer);
		fullRefreshTimer = null;
	}
}

function scheduleLiveUpdates() {
	if (document.visibilityState !== "visible" || isIdle) {
		if (liveRefreshTimer != null) {
			window.clearInterval(liveRefreshTimer);
			liveRefreshTimer = null;
		}
		return;
	}

	const hasLiveMatches = currentMatches.some(
		(match) => match.eventType === "live",
	);
	if (hasLiveMatches) {
		if (liveRefreshTimer == null) {
			liveRefreshTimer = window.setInterval(
				() => void loadLiveStatus(),
				LIVE_REFRESH_INTERVAL_MS,
			);
		}
	} else {
		if (liveRefreshTimer != null) {
			window.clearInterval(liveRefreshTimer);
			liveRefreshTimer = null;
		}
	}
}

function isNewerTimestamp(left, right) {
	const leftTime = Date.parse(left || "");
	const rightTime = Date.parse(right || "");
	return (
		Number.isFinite(leftTime) &&
		(!Number.isFinite(rightTime) || leftTime > rightTime)
	);
}

function renderCurrentMatches() {
	const liveMatches = currentMatches.filter(
		(match) => match.eventType === "live",
	);
	const scheduledMatches = currentMatches.filter(
		(match) => match.eventType === "scheduled",
	);
	liveCount.textContent = String(liveMatches.length);
	scheduledCount.textContent = String(scheduledMatches.length);

	for (const tab of matchTabs) {
		const selected = tab.dataset.matchView === currentMatchView;
		tab.setAttribute("aria-selected", String(selected));
		tab.tabIndex = selected ? 0 : -1;
	}
	const selectedTab = matchTabs.find(
		(tab) => tab.dataset.matchView === currentMatchView,
	);
	matchList.setAttribute("aria-labelledby", selectedTab?.id || "live-tab");
	renderMatches(
		currentMatchView === "live" ? liveMatches : scheduledMatches,
		currentMatchView === "live"
			? "現在、ライブ中の日本人選手の試合はありません"
			: "現在、表示できる試合予定はありません",
	);
	scheduleLiveUpdates();
}

function renderMatches(matches, emptyMessage) {
	matchList.replaceChildren();
	const groupByTournament = sortOrderSelect.value === "tournament";
	matchList.classList.toggle("time-grid", !groupByTournament);
	if (!Array.isArray(matches) || matches.length === 0) {
		const empty = document.createElement("p");
		empty.className = "empty-state";
		empty.textContent = emptyMessage;
		matchList.append(empty);
		return;
	}

	if (!groupByTournament) {
		for (const match of sortedMatches(matches, sortOrderSelect.value)) {
			matchList.append(matchElement(match, true));
		}
		return;
	}

	for (const group of tournamentGroups(matches)) {
		const section = document.createElement("section");
		section.className = "tournament-group";
		section.append(tournamentHeroElement(group.matches[0], group.name));
		const groupMatches = document.createElement("div");
		groupMatches.className = "tournament-matches";
		for (const match of group.matches) {
			groupMatches.append(matchElement(match));
		}
		section.append(groupMatches);
		matchList.append(section);
	}
}

function tournamentHeroElement(match, name) {
	const header = document.createElement("header");
	header.className = "tournament-hero";
	const picture = responsiveImage(
		match?.tournamentHeaderImageUrl,
		match?.tournamentHeaderImageMobileUrl,
		"",
		"tournament-hero-image",
	);
	if (picture) {
		header.append(picture);
	}
	const info = document.createElement("div");
	info.className = "tournament-hero-info";
	const logo = image(match?.tournamentLogoUrl, "", "tournament-logo");
	if (logo) {
		info.append(logo);
	}
	const text = document.createElement("div");
	const title = document.createElement("h3");
	title.textContent = name;
	text.append(title);
	if (match?.tournamentCategory) {
		const category = document.createElement("p");
		category.textContent = displayTournamentCategory(match.tournamentCategory);
		text.append(category);
	}
	info.append(text);
	header.append(info);
	return header;
}

function matchElement(match, showTournament = false) {
	const item = document.createElement("article");
	item.className = `match ${match.eventType === "live" ? "live-match" : "scheduled-match"}`;
	if (showTournament) {
		item.append(matchTournamentElement(match));
	}

	const header = document.createElement("header");
	header.className = "match-header";
	const meta = document.createElement("div");
	meta.className = "match-meta";
	if (match.eventType === "live") {
		const live = document.createElement("strong");
		live.className = "live-label";
		live.textContent = "ライブ中";
		meta.append(live);
	} else {
		const time = document.createElement("strong");
		time.className = "match-time";
		time.textContent = formatMatchTime(match.startTime);
		meta.append(time);
	}
	for (const value of [displayRound(match.round), displayCourt(match.court)]) {
		if (value) {
			const span = document.createElement("span");
			span.textContent = String(value);
			meta.append(span);
		}
	}
	header.append(meta);

	const actions = document.createElement("div");
	actions.className = "match-actions";
	if (match.eventType === "scheduled") {
		actions.append(matchNotificationToggle(match));
	}
	const youtube = youtubeLink(match.youtubeUrl);
	if (youtube) {
		actions.append(youtube);
	}
	if (actions.childElementCount > 0) {
		header.append(actions);
	}

	const teams = matchTeams(match);
	const scores = Array.isArray(match.scores) ? match.scores : [];
	const currentScore = scores.at(-1);
	const matchup = document.createElement("div");
	matchup.className = "matchup";
	if (teams.length >= 2) {
		matchup.append(
			teamElement(teams[0], "left"),
			matchCentreElement(match, currentScore),
			teamElement(teams[1], "right"),
		);
	} else {
		const unavailable = document.createElement("p");
		unavailable.className = "empty-matchup";
		unavailable.textContent = "対戦カード未定";
		matchup.append(unavailable);
	}

	item.append(header, matchup);
	if (match.eventType === "live" && scores.length > 0) {
		item.append(gameScoresElement(scores));
	}
	item.append(headToHeadElement(match.h2h, teams));
	return item;
}

function matchCentreElement(match, currentScore) {
	const centre = document.createElement("div");
	centre.className = "match-centre";
	if (match.eventType === "live" && currentScore) {
		const game = document.createElement("span");
		game.className = "current-game";
		game.textContent = `第${currentScore.game}ゲーム`;
		const score = document.createElement("div");
		score.className = "current-score";
		const team1Score = scoreSideElement(
			currentScore.team1,
			1,
			currentScore.servingTeam === 1,
			match.scoreChangedTeam === 1,
		);
		const separator = document.createElement("span");
		separator.className = "score-separator";
		separator.textContent = "-";
		const team2Score = scoreSideElement(
			currentScore.team2,
			2,
			currentScore.servingTeam === 2,
			match.scoreChangedTeam === 2,
		);
		score.append(team1Score, separator, team2Score);
		centre.append(game, score);
	} else {
		const versus = document.createElement("strong");
		versus.className = "versus";
		versus.textContent = "vs";
		centre.append(versus);
	}
	return centre;
}

function scoreSideElement(value, team, serving, changed) {
	const side = document.createElement("span");
	side.className = `score-side score-team-${team}${changed ? " score-updated" : ""}`;
	const score = document.createElement("strong");
	score.textContent = String(value);
	if (serving) {
		const shuttle = document.createElement("img");
		shuttle.className = "shuttle-indicator";
		shuttle.src = "/view/shuttle.svg";
		shuttle.alt = "サーブ";
		team === 1 ? side.append(shuttle, score) : side.append(score, shuttle);
	} else {
		side.append(score);
	}
	return side;
}

function gameScoresElement(scores) {
	const list = document.createElement("div");
	list.className = "game-scores";
	for (const score of scores) {
		const game = document.createElement("div");
		game.className = "game-score";
		const label = document.createElement("span");
		label.textContent = `第${score.game}ゲーム`;
		const value = document.createElement("strong");
		value.textContent = `${score.team1} - ${score.team2}`;
		game.append(label, value);
		list.append(game);
	}
	return list;
}

function matchTournamentElement(match) {
	const tournament = document.createElement("div");
	tournament.className = "match-tournament";
	const picture = responsiveImage(
		match.tournamentHeaderImageUrl,
		match.tournamentHeaderImageMobileUrl,
		"",
		"match-tournament-image",
	);
	if (picture) {
		tournament.append(picture);
	}
	const logo = image(match.tournamentLogoUrl, "", "match-tournament-logo");
	if (logo) {
		tournament.append(logo);
	}
	const text = document.createElement("div");
	const name = document.createElement("h3");
	name.textContent = String(match.tournament || "BWF");
	text.append(name);
	if (match.tournamentCategory) {
		const category = document.createElement("p");
		category.textContent = displayTournamentCategory(match.tournamentCategory);
		text.append(category);
	}
	tournament.append(text);
	return tournament;
}

function matchNotificationToggle(match) {
	const control = document.createElement("label");
	control.className = "match-notification-control";
	control.title = "この試合の通知";
	const label = document.createElement("span");
	label.textContent = "通知";
	const input = document.createElement("input");
	input.type = "checkbox";
	input.checked = !excludedMatchIds.has(match.id);
	input.disabled = !currentSubscription || savingMatchPreferences;
	input.setAttribute("aria-label", `${match.players.join(" 対 ")}の通知`);
	const track = document.createElement("span");
	track.className = "match-switch-track";
	track.setAttribute("aria-hidden", "true");
	input.addEventListener("change", () => {
		void updateMatchNotification(match.id, input.checked);
	});
	control.append(label, input, track);
	return control;
}

async function updateMatchNotification(matchId, enabled) {
	if (!currentSubscription || savingMatchPreferences) {
		return;
	}
	const previousExcludedMatchIds = new Set(excludedMatchIds);
	if (enabled) {
		excludedMatchIds.delete(matchId);
	} else {
		excludedMatchIds.add(matchId);
	}
	savingMatchPreferences = true;
	renderCurrentMatches();

	try {
		const result = await api("/api/subscriptions", {
			method: "PATCH",
			body: JSON.stringify({
				endpoint: currentSubscription.endpoint,
				excludedMatchIds: [...excludedMatchIds],
			}),
		});
		excludedMatchIds = new Set(result.excludedMatchIds || []);
		setNotificationStatus("有効");
	} catch (error) {
		excludedMatchIds = previousExcludedMatchIds;
		setNotificationStatus(message(error), true);
	} finally {
		savingMatchPreferences = false;
		renderCurrentMatches();
	}
}

function matchTeams(match) {
	if (Array.isArray(match.teams) && match.teams.length > 0) {
		return match.teams;
	}
	return Array.isArray(match.players)
		? match.players.map((name) => ({
				players: [{ name: String(name), isJapanese: false }],
			}))
		: [];
}

function teamElement(team, side) {
	const players = Array.isArray(team.players) ? team.players : [];
	const isJapanese =
		team.countryCode === "JPN" || players.some((player) => player.isJapanese);
	const element = document.createElement("section");
	element.className = `team team-${side} ${isJapanese ? "japanese-team" : "foreign-team"}`;
	const identity = document.createElement("div");
	identity.className = "team-identity";
	const flag = image(team.flagUrl, "", "country-flag");
	if (flag) {
		identity.append(flag);
	}
	const photos = document.createElement("div");
	photos.className = "player-photos";
	for (const player of players) {
		const photo = image(player.photoUrl, "", "player-photo");
		if (photo) {
			photos.append(photo);
		} else {
			const placeholder = document.createElement("span");
			placeholder.className = "player-photo player-photo-placeholder";
			placeholder.setAttribute("aria-hidden", "true");
			placeholder.textContent = playerInitial(player.name);
			photos.append(placeholder);
		}
	}
	if (photos.childElementCount > 0) {
		photos.classList.add(`player-count-${photos.childElementCount}`);
		identity.append(photos);
	}
	element.append(identity);

	const names = document.createElement("p");
	names.className = "player-names";
	players.forEach((player, index) => {
		if (index > 0) {
			const separator = document.createElement("span");
			separator.className = "player-separator";
			separator.textContent = "/";
			names.append(separator);
		}
		const name = document.createElement("span");
		name.className = player.isJapanese
			? "player-name japanese-player"
			: "player-name";
		name.textContent = String(player.name || "選手名未定");
		names.append(name);
	});
	element.append(names);
	return element;
}

function playerInitial(value) {
	const name = String(value || "").trim();
	return name ? Array.from(name)[0].toUpperCase() : "-";
}

function headToHeadElement(h2h, teams) {
	const section = document.createElement("section");
	section.className = "h2h";
	if (
		!h2h ||
		!Number.isFinite(h2h.team1Wins) ||
		!Number.isFinite(h2h.team2Wins)
	) {
		return section;
	}
	const summary = document.createElement("div");
	summary.className = "h2h-scoreline";
	const label = document.createElement("span");
	label.textContent = "対戦成績";
	const score = document.createElement("strong");
	score.textContent = `${h2h.team1Wins}勝 - ${h2h.team2Wins}勝`;
	summary.append(label, score);
	section.append(summary);

	if (h2h.previous) {
		const previous = document.createElement("div");
		previous.className = "previous-meeting";
		const detail = document.createElement("p");
		detail.className = "previous-detail";
		detail.textContent = [
			"前回対戦",
			formatPreviousDate(h2h.previous.date),
			h2h.previous.tournament,
			displayRound(h2h.previous.round),
		]
			.filter(Boolean)
			.join(" · ");
		previous.append(detail);
		if (h2h.previous.winner === 1 || h2h.previous.winner === 2) {
			const winningTeam = teams[h2h.previous.winner - 1];
			if (winningTeam) {
				const winner = document.createElement("p");
				winner.className = "previous-winner";
				winner.textContent = `${teamLabel(winningTeam)} 勝利`;
				previous.append(winner);
				const scoreline = previousGameScoreline(h2h.previous.games);
				if (scoreline) {
					const scores = document.createElement("p");
					scores.className = "previous-scoreline";
					scores.textContent = scoreline;
					previous.append(scores);
				}
			}
		}
		section.append(previous);
	}
	return section;
}

function teamLabel(team) {
	const names = Array.isArray(team.players)
		? team.players.map((player) => player.name).filter(Boolean)
		: [];
	return names.length > 0 ? names.join(" / ") : String(team.countryCode || "");
}

function youtubeLink(value) {
	const url = safeHttpsUrl(value);
	if (!url) {
		return null;
	}
	const isDirect =
		(url.hostname === "youtu.be" && /^\/[\w-]{11}$/.test(url.pathname)) ||
		(["www.youtube.com", "youtube.com", "m.youtube.com"].includes(
			url.hostname,
		) &&
			url.pathname === "/watch" &&
			/^[\w-]{11}$/.test(url.searchParams.get("v") || ""));
	if (!isDirect) {
		return null;
	}
	const link = document.createElement("a");
	link.className = "youtube-link";
	link.href = url.toString();
	link.target = "_blank";
	link.rel = "noopener noreferrer";
	link.append("配信を見る");
	const external = document.createElement("span");
	external.className = "external-mark";
	external.textContent = "↗";
	external.setAttribute("aria-hidden", "true");
	link.append(external);
	link.setAttribute("aria-label", "試合配信を開く");
	return link;
}

function responsiveImage(desktop, mobile, alt, className) {
	const desktopUrl = proxiedImageUrl(desktop);
	const mobileUrl = proxiedImageUrl(mobile);
	if (!desktopUrl && !mobileUrl) {
		return null;
	}
	const picture = document.createElement("picture");
	if (mobileUrl) {
		const source = document.createElement("source");
		source.media = "(max-width: 600px)";
		source.srcset = mobileUrl;
		picture.append(source);
	}
	const element = document.createElement("img");
	element.className = className;
	element.src = desktopUrl || mobileUrl;
	element.alt = alt;
	element.loading = "lazy";
	element.addEventListener("error", () => picture.remove(), { once: true });
	picture.append(element);
	return picture;
}

function image(value, alt, className) {
	const source = proxiedImageUrl(value);
	if (!source) {
		return null;
	}
	const element = document.createElement("img");
	element.className = className;
	element.src = source;
	element.alt = alt;
	element.loading = "lazy";
	element.addEventListener("error", () => element.remove(), { once: true });
	return element;
}

function proxiedImageUrl(value) {
	const url = safeHttpsUrl(value);
	if (!url) {
		return null;
	}
	return `/api/media?url=${encodeURIComponent(url.toString())}`;
}

function safeHttpsUrl(value) {
	try {
		const url = new URL(String(value));
		return url.protocol === "https:" ? url : null;
	} catch {
		return null;
	}
}

function displayRound(value) {
	if (!value) {
		return "";
	}
	const round = String(value).trim();
	const normalized = round.toUpperCase().replace(/[-_]+/g, " ");
	const ROUND_MAP = new Map([
		["F", "決勝"],
		["FINAL", "決勝"],
		["FINALS", "決勝"],
		["SF", "準決勝"],
		["SEMIFINAL", "準決勝"],
		["SEMI FINAL", "準決勝"],
		["SEMIFINALS", "準決勝"],
		["SEMI FINALS", "準決勝"],
		["QF", "準々決勝"],
		["QUARTERFINAL", "準々決勝"],
		["QUARTER FINAL", "準々決勝"],
		["QUARTERFINALS", "準々決勝"],
		["QUARTER FINALS", "準々決勝"],
	]);
	const roundLabel = ROUND_MAP.get(normalized);
	if (roundLabel) {
		return roundLabel;
	}
	const numbered = normalized.match(/^(?:R|ROUND OF )(16|32|64|128)$/);
	if (numbered) {
		return `ベスト${numbered[1]}`;
	}
	if (normalized.includes("QUALIF")) {
		return "予選";
	}
	return round;
}

function displayCourt(value) {
	if (!value) {
		return "";
	}
	const court = String(value).trim();
	const number = court.match(/\d+/)?.[0];
	if (number) {
		return `第${Number(number)}コート`;
	}
	return /stream/i.test(court) ? "配信コート" : court;
}

function displayTournamentCategory(value) {
	const category = String(value || "").trim();
	const worldTour = category.match(/BWF WORLD TOUR SUPER\s*(\d+)/i);
	if (worldTour) {
		return `ワールドツアー スーパー${worldTour[1]}`;
	}
	const labels = {
		"BWF WORLD TOUR FINALS": "ワールドツアーファイナルズ",
		"INTERNATIONAL CHALLENGE": "国際チャレンジ",
		"INTERNATIONAL SERIES": "国際シリーズ",
		"FUTURE SERIES": "フューチャーシリーズ",
	};
	return labels[category.toUpperCase()] || category;
}

function formatPreviousDate(value) {
	if (!value) {
		return "";
	}
	const date = new Date(`${value}T00:00:00`);
	return Number.isNaN(date.getTime())
		? String(value)
		: FMT_DATE_MEDIUM.format(date);
}

function formatMatchTime(value) {
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

async function api(path, options = {}) {
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
		const payload = await response.json();
		if (!response.ok) {
			throw new Error(payload.error || `Request failed (${response.status})`);
		}
		return payload;
	} finally {
		clearTimeout(timeoutTimer);
	}
}

function setNotificationStatus(text, isError = false) {
	notificationStatus.textContent = text;
	notificationStatus.classList.toggle("error", isError);
}

function formatDate(value) {
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? "時刻不明" : FMT_DATETIME.format(date);
}

function base64UrlToBytes(value) {
	const padding = "=".repeat((4 - (value.length % 4)) % 4);
	const decoded = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
	return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function message(error) {
	return error instanceof Error ? error.message : "処理に失敗しました";
}
