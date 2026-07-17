const toggle = document.querySelector("#notification-toggle");
const notificationStatus = document.querySelector("#notification-status");
const testNotificationButton = document.querySelector(
	"#test-notification-button",
);
const lastUpdated = document.querySelector("#last-updated");
const matchList = document.querySelector("#match-list");
const refreshButton = document.querySelector("#refresh-button");

let registration;
let vapidPublicKey;

void initialize();

toggle.addEventListener("change", () => {
	void updateNotificationSubscription(toggle.checked);
});

refreshButton.addEventListener("click", () => {
	void loadStatus();
});

testNotificationButton.addEventListener("click", () => {
	void sendTestNotification();
});

document.addEventListener("visibilitychange", () => {
	if (document.visibilityState === "visible") {
		void loadStatus();
	}
});

async function initialize() {
	await Promise.all([initializeNotifications(), loadStatus()]);
}

async function initializeNotifications() {
	if (
		!("serviceWorker" in navigator) ||
		!("PushManager" in window) ||
		!("Notification" in window)
	) {
		setNotificationStatus("このブラウザはWeb Pushに対応していません", true);
		return;
	}

	try {
		const config = await api("/api/config");
		vapidPublicKey = config.vapidPublicKey;
		registration = await navigator.serviceWorker.register("/sw.js");
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

		const subscription = await registration.pushManager.getSubscription();
		if (!subscription) {
			throw new Error("通知の購読情報がありません");
		}

		await api("/api/notifications/test", {
			method: "POST",
			body: JSON.stringify(subscription),
		});
		setNotificationStatus("テスト通知を送信しました");
	} catch (error) {
		setNotificationStatus(message(error), true);
	} finally {
		testNotificationButton.disabled = !toggle.checked;
	}
}

async function saveSubscription(subscription) {
	await api("/api/subscriptions", {
		method: "POST",
		body: JSON.stringify(subscription),
	});
}

async function loadStatus() {
	refreshButton.disabled = true;
	try {
		const state = await api("/api/status");
		renderMatches(state.matches);
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

function renderMatches(matches) {
	matchList.replaceChildren();
	if (!Array.isArray(matches) || matches.length === 0) {
		const empty = document.createElement("p");
		empty.className = "empty-state";
		empty.textContent = "現在、対象のライブ試合はありません";
		matchList.append(empty);
		return;
	}

	for (const match of matches) {
		const item = document.createElement("article");
		item.className = "match";

		const tournament = document.createElement("p");
		tournament.className = "match-tournament";
		tournament.textContent = String(match.tournament || "BWF");

		const players = document.createElement("p");
		players.className = "match-players";
		players.textContent = Array.isArray(match.players)
			? match.players.join(" vs ")
			: "対戦カード未定";

		const meta = document.createElement("p");
		meta.className = "match-meta";
		for (const value of [match.round, match.court, match.status]) {
			if (value) {
				const span = document.createElement("span");
				span.textContent = String(value);
				meta.append(span);
			}
		}

		item.append(tournament, players, meta);
		matchList.append(item);
	}
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
