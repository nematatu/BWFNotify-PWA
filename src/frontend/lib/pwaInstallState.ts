import { createSignal } from "solid-js";
import {
	isGoogleApp,
	isIosDevice,
	isMobileBrowser,
	isStandaloneDisplay,
} from "./browser";

/** インストール案内の1ステップ目に表示する内容。 */
export type InstallGuidance = {
	title: string;
	description: string;
	hasAction: boolean;
};

export interface DeferredInstallPrompt {
	prompt: () => Promise<void>;
	userChoice?: Promise<{ outcome: "accepted" | "dismissed" | string }>;
}

// --- 状態 ---
// 書き換えはこのモジュールの操作関数だけに限り、外部へは読み取り関数だけを公開する。
const [installPrompt, setInstallPrompt] =
	createSignal<DeferredInstallPrompt | null>(null);
const [installOpen, setInstallOpen] = createSignal(false);
const [bannerHidden, setBannerHidden] = createSignal(true);

export { bannerHidden, installOpen };

export const standalone = () => isStandaloneDisplay();

/** ホーム画面版でないモバイルブラウザにだけ、追加案内のバナーを出す。 */
export const showInstallBannerIfNeeded = () => {
	if (!standalone() && isMobileBrowser()) setBannerHidden(false);
};

// --- 操作 ---
export const openInstall = () => {
	if (standalone()) return;
	setInstallOpen(true);
	document.body.classList.add("overlay-open");
};

export const closeInstall = () => {
	setInstallOpen(false);
	document.body.classList.remove("overlay-open");
};

export const handleInstall = async (dismissButton?: HTMLButtonElement) => {
	const prompt = installPrompt();
	if (!prompt) return;
	try {
		await prompt.prompt();
		const choice = await prompt.userChoice;
		setInstallPrompt(null);
		if (choice?.outcome === "accepted") {
			closeInstall();
		} else {
			dismissButton?.focus();
		}
	} catch (error) {
		console.error("Install prompt error:", error);
	}
};

export const guidance = (): InstallGuidance => {
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
};

// --- ブラウザのインストールイベント（読み込み時に一度だけ登録） ---
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
