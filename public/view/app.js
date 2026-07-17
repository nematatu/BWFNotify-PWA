import {
	DEFAULT_SORT_ORDER,
	sortedMatches,
	tournamentGroups,
} from "./match-groups.js?v=19";

const toggle = document.querySelector("#notification-toggle");
const notificationStatus = document.querySelector("#notification-status");
const testNotificationButton = document.querySelector(
	"#test-notification-button",
);
const installAppButton = document.querySelector("#install-app-button");
const installHelpDialog = document.querySelector("#install-help-dialog");
const lastUpdated = document.querySelector("#last-updated");
const liveMatchList = document.querySelector("#live-match-list");
const scheduledMatchList = document.querySelector("#scheduled-match-list");
const refreshButton = document.querySelector("#refresh-button");
const sortOrderSelect = document.querySelector("#sort-order");

let registration;
let vapidPublicKey;
let currentMatches = [];
let currentSubscription = null;
let excludedMatchIds = new Set();
let savingMatchPreferences = false;
let installPrompt = null;

window.addEventListener("beforeinstallprompt", (event) => {
	event.preventDefault();
	installPrompt = event;
	installAppButton.hidden = false;
});

window.addEventListener("appinstalled", () => {
	installPrompt = null;
	installAppButton.hidden = true;
});

void initialize();

toggle.addEventListener("change", () => {
	void updateNotificationSubscription(toggle.checked);
});

refreshButton.addEventListener("click", () => {
	void loadStatus();
});

sortOrderSelect.addEventListener("change", () => {
	localStorage.setItem("bwf-sort-order", sortOrderSelect.value);
	renderCurrentMatches();
});

testNotificationButton.addEventListener("click", () => {
	void sendTestNotification();
});

installAppButton.addEventListener("click", () => {
	void installApp();
});

document.addEventListener("visibilitychange", () => {
	if (document.visibilityState === "visible") {
		void loadStatus();
	}
});

async function initialize() {
	const savedSortOrder = localStorage.getItem("bwf-sort-order");
	sortOrderSelect.value = ["time-asc", "time-desc", "tournament"].includes(
		savedSortOrder,
	)
		? savedSortOrder
		: DEFAULT_SORT_ORDER;
	await Promise.all([initializeNotifications(), loadStatus()]);
}

async function initializeNotifications() {
	if (!window.isSecureContext) {
		setNotificationStatus("通知にはHTTPS接続が必要です", true);
		return;
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
			setNotificationStatus("無効");
		}
		toggle.disabled = Notification.permission === "denied";
	} catch (error) {
		setNotificationStatus(message(error), true);
	}
}

function showInstallRequired() {
	setNotificationStatus("ホーム画面版で通知を利用できます");
	installAppButton.hidden = false;
	toggle.disabled = true;
	testNotificationButton.disabled = true;
}

async function installApp() {
	if (installPrompt) {
		await installPrompt.prompt();
		await installPrompt.userChoice;
		installPrompt = null;
		installAppButton.hidden = true;
		return;
	}
	installHelpDialog.showModal();
}

async function updateNotificationSubscription(enabled) {
	toggle.disabled = true;
	try {
		if (!registration || !vapidPublicKey) {
			throw new Error("通知設定を読み込めませんでした");
		}

		const current = await registration.pushManager.getSubscription();
		if (enabled) {
			const permission = await Notification.requestPermission();
			if (permission !== "granted") {
				throw new Error("通知が許可されていません");
			}

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
			setNotificationStatus("無効");
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

		const options = {
			body: "通知は正常に表示できます",
			icon: "/pwa/icons/icon-192.png",
			tag: `bwf-test-${Date.now()}`,
			data: { url: "/" },
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
		currentMatches = Array.isArray(state.matches) ? state.matches : [];
		renderCurrentMatches();
		lastUpdated.textContent = state.checkedAt
			? `${formatDate(state.checkedAt)} 更新`
			: "次回チェック待ち";
		lastUpdated.classList.remove("error");
	} catch (error) {
		lastUpdated.textContent = message(error);
		lastUpdated.classList.add("error");
	} finally {
		refreshButton.disabled = false;
	}
}

function renderCurrentMatches() {
	renderMatches(
		liveMatchList,
		currentMatches.filter((match) => match.eventType === "live"),
		"現在、ライブ中の試合はありません",
	);
	renderMatches(
		scheduledMatchList,
		currentMatches.filter((match) => match.eventType === "scheduled"),
		"現在、ライブ予定の試合はありません",
	);
}

function renderMatches(container, matches, emptyMessage) {
	container.replaceChildren();
	if (!Array.isArray(matches) || matches.length === 0) {
		const empty = document.createElement("p");
		empty.className = "empty-state";
		empty.textContent = emptyMessage;
		container.append(empty);
		return;
	}

	if (sortOrderSelect.value !== "tournament") {
		for (const match of sortedMatches(matches, sortOrderSelect.value)) {
			container.append(matchElement(match, true));
		}
		return;
	}

	for (const group of tournamentGroups(matches)) {
		const section = document.createElement("section");
		section.className = "tournament-group";
		const heading = document.createElement("div");
		heading.className = "tournament-heading";
		const logo = image(group.logoUrl, "", "tournament-logo");
		if (logo) {
			heading.append(logo);
		}
		const name = document.createElement("h4");
		name.textContent = group.name;
		heading.append(name);
		section.append(heading);

		const groupMatches = document.createElement("div");
		groupMatches.className = "tournament-matches";
		for (const match of group.matches) {
			groupMatches.append(matchElement(match));
		}
		section.append(groupMatches);
		container.append(section);
	}
}

function matchElement(match, showTournament = false) {
	const item = document.createElement("article");
	item.className = "match";
	if (showTournament) {
		item.append(matchTournamentElement(match));
	}
	const header = document.createElement("div");
	header.className = "match-header";
	const meta = document.createElement("p");
	meta.className = "match-meta";
	for (const value of [
		formatMatchTime(match.startTime),
		match.round,
		match.court,
	]) {
		if (value) {
			const span = document.createElement("span");
			span.textContent = String(value);
			meta.append(span);
		}
	}
	header.append(meta);
	const actions = document.createElement("div");
	actions.className = "match-actions";
	actions.append(matchNotificationToggle(match));
	const matchLink = externalLink(match.matchUrl);
	if (matchLink) {
		actions.append(matchLink);
	}
	header.append(actions);

	const teams = matchTeams(match);
	const matchup = document.createElement("div");
	matchup.className = "matchup";
	if (teams.length >= 2) {
		matchup.append(teamElement(teams[0]));
		const versus = document.createElement("span");
		versus.className = "versus";
		versus.textContent = "VS";
		matchup.append(versus, teamElement(teams[1]));
	} else {
		const unavailable = document.createElement("p");
		unavailable.className = "empty-matchup";
		unavailable.textContent = "対戦カード未定";
		matchup.append(unavailable);
	}

	item.append(header, matchup, headToHeadElement(match.h2h, teams));
	return item;
}

function matchTournamentElement(match) {
	const tournament = document.createElement("div");
	tournament.className = "match-tournament";
	const logo = image(match.tournamentLogoUrl, "", "match-tournament-logo");
	if (logo) {
		tournament.append(logo);
	}
	const name = document.createElement("h4");
	name.textContent = String(match.tournament || "BWF");
	tournament.append(name);
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

function teamElement(team) {
	const players = Array.isArray(team.players) ? team.players : [];
	const isJapanese =
		team.countryCode === "JPN" || players.some((player) => player.isJapanese);
	const element = document.createElement("section");
	element.className = isJapanese ? "team japanese-team" : "team foreign-team";
	const identity = document.createElement("div");
	identity.className = "team-identity";
	const country = document.createElement("div");
	country.className = "team-country";
	const flag = image(team.flagUrl, "", "country-flag");
	if (flag) {
		country.append(flag);
	}
	if (country.childElementCount > 0) {
		identity.append(country);
	}

	const photos = document.createElement("div");
	photos.className = "player-photos";
	for (const player of players) {
		const photo = image(player.photoUrl, "", "player-photo");
		if (photo) {
			photos.append(photo);
		}
	}
	if (photos.childElementCount > 0) {
		identity.append(photos);
	}
	element.append(identity);

	const names = document.createElement("p");
	names.className = "player-names";
	players.forEach((player, index) => {
		if (index > 0) {
			names.append(" / ");
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

function headToHeadElement(h2h, teams) {
	const section = document.createElement("section");
	section.className = "h2h";
	if (
		!h2h ||
		!Number.isFinite(h2h.team1Wins) ||
		!Number.isFinite(h2h.team2Wins)
	) {
		const unavailable = document.createElement("p");
		unavailable.className = "h2h-unavailable";
		unavailable.textContent = "H2H データなし";
		section.append(unavailable);
		return section;
	}
	const summary = document.createElement("div");
	summary.className = "h2h-scoreline";
	const label = document.createElement("span");
	label.textContent = "H2H";
	const score = document.createElement("strong");
	score.textContent = `${h2h.team1Wins} - ${h2h.team2Wins}`;
	summary.append(label, score);
	section.append(summary);

	if (h2h.previous) {
		const previous = document.createElement("div");
		previous.className = "previous-meeting";
		const heading = document.createElement("p");
		heading.className = "previous-heading";
		heading.textContent = "前回対戦";
		const detail = document.createElement("p");
		detail.className = "previous-detail";
		detail.textContent = [
			formatPreviousDate(h2h.previous.date),
			h2h.previous.tournament,
			h2h.previous.round,
		]
			.filter(Boolean)
			.join(" · ");
		previous.append(heading, detail);
		if (h2h.previous.winner === 1 || h2h.previous.winner === 2) {
			const winningTeam = teams[h2h.previous.winner - 1];
			if (winningTeam) {
				const winner = document.createElement("p");
				winner.className = "previous-winner";
				const winningScores = h2h.previous.games
					.map((game) => (h2h.previous.winner === 1 ? game.team1 : game.team2))
					.join(" · ");
				winner.textContent = `${teamLabel(winningTeam)} 勝利${winningScores ? ` · ${winningScores}` : ""}`;
				previous.append(winner);
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

function externalLink(value) {
	const url = safeHttpsUrl(value);
	if (!url) {
		return null;
	}
	const link = document.createElement("a");
	link.className = "external-link";
	link.href = url;
	link.target = "_blank";
	link.rel = "noopener noreferrer";
	link.title = "BWFの試合掲載ページを開く";
	link.setAttribute("aria-label", "BWFの試合掲載ページを新しいタブで開く");
	link.textContent = "↗";
	return link;
}

function image(value, alt, className) {
	const url = safeHttpsUrl(value);
	if (!url) {
		return null;
	}
	const element = document.createElement("img");
	element.className = className;
	const source = new URL("/api/media", window.location.origin);
	source.searchParams.set("url", url);
	element.src = source.toString();
	element.alt = alt;
	element.loading = "lazy";
	element.addEventListener("error", () => element.remove(), { once: true });
	return element;
}

function safeHttpsUrl(value) {
	try {
		const url = new URL(String(value));
		return url.protocol === "https:" ? url.toString() : null;
	} catch {
		return null;
	}
}

function formatPreviousDate(value) {
	if (!value) {
		return "";
	}
	const date = new Date(`${value}T00:00:00`);
	return Number.isNaN(date.getTime())
		? String(value)
		: new Intl.DateTimeFormat("ja-JP", {
				dateStyle: "medium",
			}).format(date);
}

function formatMatchTime(value) {
	if (!value) {
		return "";
	}
	const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
		? `${value.replace(" ", "T")}Z`
		: value;
	const date = new Date(normalized);
	if (Number.isNaN(date.getTime())) {
		return String(value);
	}
	return new Intl.DateTimeFormat("ja-JP", {
		month: "numeric",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(date);
}

async function api(path, options = {}) {
	const response = await fetch(path, {
		...options,
		headers: {
			...(options.body ? { "content-type": "application/json" } : {}),
			...options.headers,
		},
	});
	const payload = await response.json();
	if (!response.ok) {
		throw new Error(payload.error || `Request failed (${response.status})`);
	}
	return payload;
}

function setNotificationStatus(text, isError = false) {
	notificationStatus.textContent = text;
	notificationStatus.classList.toggle("error", isError);
}

function formatDate(value) {
	const date = new Date(value);
	return Number.isNaN(date.getTime())
		? "時刻不明"
		: new Intl.DateTimeFormat("ja-JP", {
				month: "numeric",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit",
			}).format(date);
}

function base64UrlToBytes(value) {
	const padding = "=".repeat((4 - (value.length % 4)) % 4);
	const decoded = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
	return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function message(error) {
	return error instanceof Error ? error.message : "処理に失敗しました";
}
