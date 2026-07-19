import { createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { InstallGuidance } from "../components/Notifications";
import { isGoogleApp, isIosDevice, isStandaloneDisplay } from "./utils";

export interface DeferredInstallPrompt {
	prompt: () => Promise<void>;
	userChoice?: Promise<{ outcome: "accepted" | "dismissed" | string }>;
}

export function usePwaInstall() {
	const [installPrompt, setInstallPrompt] =
		createSignal<DeferredInstallPrompt | null>(null);
	const [installOpen, setInstallOpen] = createSignal(false);
	const [bannerHidden, setBannerHidden] = createSignal(true);

	const standalone = () => isStandaloneDisplay();

	const installDismissed = (): boolean => {
		try {
			return sessionStorage.getItem("bwf-install-overlay-dismissed") === "1";
		} catch {
			return false;
		}
	};

	const openInstall = () => {
		if (standalone() || installDismissed()) return;
		setInstallOpen(true);
		document.body.classList.add("overlay-open");
	};

	const closeInstall = (dismiss = false) => {
		setInstallOpen(false);
		document.body.classList.remove("overlay-open");
		if (dismiss) {
			try {
				sessionStorage.setItem("bwf-install-overlay-dismissed", "1");
			} catch {
				/* private mode */
			}
		}
	};

	const guidance = createMemo((): InstallGuidance => {
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

	onMount(() => {
		const onBeforeInstall = (e: Event) => {
			e.preventDefault();
			setInstallPrompt(e as unknown as DeferredInstallPrompt);
		};
		const onAppInstalled = () => {
			setInstallPrompt(null);
			closeInstall(true);
		};

		window.addEventListener("beforeinstallprompt", onBeforeInstall);
		window.addEventListener("appinstalled", onAppInstalled);

		onCleanup(() => {
			window.removeEventListener("beforeinstallprompt", onBeforeInstall);
			window.removeEventListener("appinstalled", onAppInstalled);
		});
	});

	return {
		installPrompt,
		setInstallPrompt,
		installOpen,
		openInstall,
		closeInstall,
		bannerHidden,
		setBannerHidden,
		guidance,
		standalone,
	};
}
