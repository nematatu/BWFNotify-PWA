import { isStandaloneDisplay } from "./utils";

/**
 * Service Worker の登録およびクリーンアップ処理を管理するインフラ層モジュール
 */
export async function registerServiceWorker(
	scope = "/",
): Promise<ServiceWorkerRegistration | undefined> {
	if (!("serviceWorker" in navigator)) {
		throw new Error("Service Worker is not supported in this browser.");
	}

	const isDev = import.meta.env.DEV;

	// 開発環境（Vite / wrangler dev）かつ通常のブラウザでのアクセスの場合は、
	// Service Workerを一切登録せず、既存の古い登録があればすべて強制解除する
	if (isDev && !isStandaloneDisplay()) {
		try {
			const registrations = await navigator.serviceWorker.getRegistrations();
			for (const reg of registrations) {
				await reg.unregister();
				console.log("Development mode (browser): Unregistered Service Worker.");
			}
		} catch (e) {
			console.warn("Failed to unregister service workers:", e);
		}
		return undefined;
	}

	return navigator.serviceWorker.register("/pwa/sw.js", { scope });
}
