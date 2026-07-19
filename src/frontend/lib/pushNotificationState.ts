import { createMemo, createSignal } from "solid-js";
import type {
	SaveSubscriptionRequest,
	SubscriptionResponse,
	TestNotificationRequest,
	UpdateSubscriptionPreferencesRequest,
} from "../../type";
import { registerServiceWorker } from "./pwa";
import { openInstall } from "./pwaInstallState";
import {
	api,
	base64UrlToBytes,
	errorMessage,
	isStandaloneDisplay,
} from "./utils";

// --- Domain States ---
export const [notifText, setNotifText] = createSignal("確認中");
export const [notifError, setNotifError] = createSignal(false);
export const [testDisabled, setTestDisabled] = createSignal(true);
export const [toggleDisabled, setToggleDisabled] = createSignal(true);
export const [toggleChecked, setToggleChecked] = createSignal(false);
export const [excludedIds, setExcludedIds] = createSignal<Set<string>>(
	new Set(),
);
export const [permissionOpen, setPermissionOpen] = createSignal(false);
const [subscription, setSubscription] = createSignal<PushSubscription | null>(
	null,
);

let registration: ServiceWorkerRegistration | undefined;
let vapidKey: string | undefined;
let preferenceWrite: Promise<void> = Promise.resolve();
let preferenceVersion = 0;

export const notificationDisabled = createMemo(
	() =>
		!(
			subscription() &&
			"Notification" in window &&
			Notification.permission === "granted"
		),
);

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

// --- Domain Actions ---
export const initNotifications = async () => {
	if (!window.isSecureContext) {
		setStatus("通知にはHTTPS接続が必要です", true);
		return;
	}

	try {
		registration = await registerServiceWorker();
		if (!registration) {
			setStatus("開発環境: 通知は無効化されています");
			setToggleDisabled(true);
			setTestDisabled(true);
			return;
		}

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
};

export const updateSubscription = async (enabled: boolean) => {
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
	} catch (e) {
		setStatus(errorMessage(e), true);
	} finally {
		setTestDisabled(false);
	}
};

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
			} catch (e) {
				if (version === preferenceVersion) {
					setStatus(errorMessage(e), true);
					await saveSubscription(sub);
				}
				throw e;
			}
		});
	await preferenceWrite.catch(() => undefined);
};

export const onToggleClick = (e: Event) => {
	if (!isStandaloneDisplay()) {
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
		setPermissionOpen(true);
		document.body.classList.add("overlay-open");
	}
};

export const onToggleChange = (e: Event) => {
	if (!isStandaloneDisplay()) return;
	void updateSubscription((e.target as HTMLInputElement).checked);
};

export const closePermission = () => {
	setPermissionOpen(false);
	document.body.classList.remove("overlay-open");
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
