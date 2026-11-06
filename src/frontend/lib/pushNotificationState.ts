import { createSignal } from "solid-js";
import type {
	SaveSubscriptionRequest,
	SubscriptionResponse,
	TestNotificationRequest,
	UpdateSubscriptionPreferencesRequest,
} from "../../type";
import { api, errorMessage } from "./api";
import {
	base64UrlToBytes,
	isIosDevice,
	isStandaloneDisplay,
	notificationToggleAction,
} from "./browser";
import { registerServiceWorker } from "./pwa";
import { openInstall } from "./pwaInstallState";

// --- 状態 ---
// 書き換えはこのモジュールの操作関数だけに限り、外部へは読み取り関数だけを公開する。
const [notifText, setNotifText] = createSignal("確認中");
const [notifError, setNotifError] = createSignal(false);
const [testDisabled, setTestDisabled] = createSignal(true);
const [toggleDisabled, setToggleDisabled] = createSignal(true);
const [toggleChecked, setToggleChecked] = createSignal(false);
const [excludedIds, setExcludedIds] = createSignal<Set<string>>(new Set());
const [permissionOpen, setPermissionOpen] = createSignal(false);
const [permissionBlockedOpen, setPermissionBlockedOpen] = createSignal(false);
const [subscription, setSubscription] = createSignal<PushSubscription | null>(
	null,
);

let registration: ServiceWorkerRegistration | undefined;
let vapidKey: string | undefined;
let preferenceWrite: Promise<void> = Promise.resolve();
let preferenceVersion = 0;

export {
	excludedIds,
	notifError,
	notifText,
	permissionBlockedOpen,
	permissionOpen,
	testDisabled,
	toggleChecked,
	toggleDisabled,
};

/** 試合ごとの通知トグルを操作できない状態か（購読がない、または未許可）。 */
export const notificationDisabled = () =>
	!(
		subscription() &&
		"Notification" in window &&
		Notification.permission === "granted"
	);

const setOverlayOpen = (open: boolean) =>
	document.body.classList.toggle("overlay-open", open);

const disableNotificationControls = () => {
	setToggleDisabled(true);
	setTestDisabled(true);
};

const setStatus = (text: string, isError = false) => {
	setNotifText(text);
	setNotifError(isError);
};

const saveSubscription = async (sub: PushSubscription) => {
	const json = sub.toJSON();
	const request: SaveSubscriptionRequest = {
		subscription: {
			endpoint: sub.endpoint,
			keys: {
				p256dh: json.keys?.p256dh || "",
				auth: json.keys?.auth || "",
			},
		},
	};
	const res = await api<SubscriptionResponse>("/api/subscriptions", {
		method: "POST",
		body: JSON.stringify(request),
	});
	setExcludedIds(
		new Set(Array.isArray(res.excludedMatchIds) ? res.excludedMatchIds : []),
	);
};

// --- 操作 ---
export const initNotifications = async () => {
	setStatus("確認中");
	setToggleDisabled(true);
	setTestDisabled(true);
	if (!window.isSecureContext) {
		setStatus("通知にはHTTPS接続が必要です", true);
		return;
	}

	try {
		registration = await registerServiceWorker();
		// 待機中に別の操作で有効化されていても、通知を使えない環境では必ず無効に戻す。
		if (!registration) {
			setStatus("開発環境: 通知は無効化されています");
			disableNotificationControls();
			return;
		}

		if (!("pushManager" in registration) || !("Notification" in window)) {
			setStatus("ホーム画面版で通知を利用できます");
			disableNotificationControls();
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
			setStatus("通知がブロックされています", true);
		} else {
			setStatus("オフ");
		}
		setToggleDisabled(false);
	} catch (error) {
		setStatus(errorMessage(error), true);
	}
};

const updateSubscription = async (enabled: boolean) => {
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
	} catch (error) {
		setStatus(errorMessage(error), true);
		setToggleChecked(false);
	} finally {
		setToggleDisabled(false);
	}
};

export const sendTest = async () => {
	const sub = subscription();
	if (!sub) return;
	setTestDisabled(true);
	try {
		const request: TestNotificationRequest = { endpoint: sub.endpoint };
		await api("/api/subscriptions/test", {
			method: "POST",
			body: JSON.stringify(request),
		});
		setStatus("テスト通知を送信しました");
	} catch (error) {
		setStatus(errorMessage(error), true);
	} finally {
		setTestDisabled(false);
	}
};

/**
 * 試合ごとの通知除外を保存する。画面は即時に更新し、保存は直列化する。
 * 連続操作では最後の操作の結果だけを画面へ反映し、失敗時は購読を再保存して
 * サーバー側の除外設定と画面を揃える。
 */
export const updateMatchNotif = async (matchId: string, enabled: boolean) => {
	const sub = subscription();
	if (!sub) return;
	const next = new Set(excludedIds());
	if (enabled) next.delete(matchId);
	else next.add(matchId);
	setExcludedIds(next);
	const version = ++preferenceVersion;
	const request: UpdateSubscriptionPreferencesRequest = {
		endpoint: sub.endpoint,
		excludedMatchIds: [...next],
	};
	preferenceWrite = preferenceWrite
		.catch(() => undefined)
		.then(async () => {
			try {
				const saved = await api<SubscriptionResponse>("/api/subscriptions", {
					method: "PATCH",
					body: JSON.stringify(request),
				});
				if (version === preferenceVersion) {
					setExcludedIds(new Set(saved.excludedMatchIds));
				}
			} catch (error) {
				if (version === preferenceVersion) {
					setStatus(errorMessage(error), true);
					await saveSubscription(sub);
				}
				throw error;
			}
		});
	await preferenceWrite.catch(() => undefined);
};

export const onToggleClick = (event: Event) => {
	const action = notificationToggleAction(
		Notification.permission,
		isIosDevice(),
		isStandaloneDisplay(),
	);
	if (action === "install") {
		event.preventDefault();
		openInstall();
		return;
	}
	if (action === "blocked") {
		event.preventDefault();
		setPermissionBlockedOpen(true);
		setOverlayOpen(true);
		return;
	}
	if (
		!toggleChecked() &&
		"Notification" in window &&
		Notification.permission === "default"
	) {
		event.preventDefault();
		setPermissionOpen(true);
		setOverlayOpen(true);
	}
};

export const onToggleChange = (event: Event) => {
	void updateSubscription((event.target as HTMLInputElement).checked);
};

const closePermission = () => {
	setPermissionOpen(false);
	setOverlayOpen(false);
};

export const confirmPermission = () => {
	closePermission();
	setToggleChecked(true);
	void updateSubscription(true);
};

export const cancelPermission = () => {
	closePermission();
	setToggleChecked(false);
};

export const closeBlockedPermission = () => {
	setPermissionBlockedOpen(false);
	setOverlayOpen(false);
};

export const retryNotificationPermission = () => {
	closeBlockedPermission();
	void initNotifications();
};
