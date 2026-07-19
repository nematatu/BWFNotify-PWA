import { createMemo, createSignal } from "solid-js";
import { registerServiceWorker } from "./pwa";
import {
	api,
	base64UrlToBytes,
	errorMessage,
	isMobileBrowser,
	isStandaloneDisplay,
} from "./utils";

export function usePushNotifications(
	setBannerHidden: (v: boolean) => void,
	openInstall: () => void,
	openPermission: () => void,
	toggleChecked: () => boolean,
	setToggleChecked: (v: boolean) => void,
) {
	const [notifText, setNotifText] = createSignal("確認中");
	const [notifError, setNotifError] = createSignal(false);
	const [testDisabled, setTestDisabled] = createSignal(true);
	const [toggleDisabled, setToggleDisabled] = createSignal(true);
	const [excludedIds, setExcludedIds] = createSignal<Set<string>>(new Set());
	const [subscription, setSubscription] = createSignal<PushSubscription | null>(
		null,
	);

	let registration: ServiceWorkerRegistration | undefined;
	let vapidKey: string | undefined;
	let savingPrefs = false;

	const standalone = () => isStandaloneDisplay();

	const notificationDisabled = createMemo(
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
		const res = await api<{ excludedMatchIds?: string[] }>(
			"/api/subscriptions",
			{
				method: "POST",
				body: JSON.stringify({ subscription: sub }),
			},
		);
		setExcludedIds(
			new Set(Array.isArray(res.excludedMatchIds) ? res.excludedMatchIds : []),
		);
	};

	const initNotifications = async () => {
		if (!window.isSecureContext) {
			setStatus("通知にはHTTPS接続が必要です", true);
			return;
		}
		if (!standalone() && isMobileBrowser()) {
			setBannerHidden(false);
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
		} catch (e) {
			setStatus(errorMessage(e), true);
			setToggleChecked(false);
		} finally {
			setToggleDisabled(Notification.permission === "denied");
		}
	};

	const sendTest = async () => {
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
	};

	const updateMatchNotif = async (matchId: string, enabled: boolean) => {
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
	};

	const onToggleClick = (e: Event) => {
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
	};

	const onToggleChange = (e: Event) => {
		if (!standalone()) return;
		void updateSubscription((e.target as HTMLInputElement).checked);
	};

	return {
		notifText,
		notifError,
		testDisabled,
		toggleDisabled,
		excludedIds,
		notificationDisabled,
		initNotifications,
		updateSubscription,
		sendTest,
		updateMatchNotif,
		onToggleClick,
		onToggleChange,
	};
}
