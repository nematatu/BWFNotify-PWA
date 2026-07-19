import { createMemo, createSignal } from "solid-js";
import type { InstallGuidance } from "../components/Notifications";
import { isGoogleApp, isIosDevice, isStandaloneDisplay } from "./utils";

export interface DeferredInstallPrompt {
	prompt: () => Promise<void>;
	userChoice?: Promise<{ outcome: "accepted" | "dismissed" | string }>;
}

// --- Domain States ---
export const [installPrompt, setInstallPrompt] =
	createSignal<DeferredInstallPrompt | null>(null);
export const [installOpen, setInstallOpen] = createSignal(false);
export const [bannerHidden, setBannerHidden] = createSignal(true);

export const standalone = () => isStandaloneDisplay();

// --- Domain Actions ---
export const openInstall = () => {
	if (standalone()) return;
	setInstallOpen(true);
	document.body.classList.add("overlay-open");
};

export const closeInstall = () => {
	setInstallOpen(false);
	document.body.classList.remove("overlay-open");
};

export const handleInstall = async (
	dismissBtnRef?: HTMLButtonElement | undefined,
) => {
	const prompt = installPrompt();
	if (!prompt) return;
	try {
		await prompt.prompt();
		const choice = await prompt.userChoice;
		setInstallPrompt(null);
		if (choice?.outcome === "accepted") {
			closeInstall();
		} else if (dismissBtnRef) {
			dismissBtnRef.focus();
		}
	} catch (e) {
		console.error("Install prompt error:", e);
	}
};

export const guidance = createMemo((): InstallGuidance => {
	if (installPrompt()) {
		return {
			title: "ホーム画面に追加",
			description: "下のボタンを押すと、ブラウザの追加確認が開きます。",
			hasAction: true,
		};
	}
	if (isGoogleApp()) {
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

// --- Initialize Event Listeners (Run once) ---
if (typeof window !== "undefined") {
	const onBeforeInstall = (e: Event) => {
		e.preventDefault();
		setInstallPrompt(e as unknown as DeferredInstallPrompt);
	};
	const onAppInstalled = () => {
		setInstallPrompt(null);
		closeInstall();
	};

	window.addEventListener("beforeinstallprompt", onBeforeInstall);
	window.addEventListener("appinstalled", onAppInstalled);
}
