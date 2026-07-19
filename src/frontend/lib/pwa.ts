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
	// 開発環境かつ通常のブラウザでのアクセスの場合は、SWを登録せず、既存のSWをすべて強制的に登録解除する
	if (isDev && !isStandaloneDisplay()) {
		const registrations = await navigator.serviceWorker.getRegistrations();
		for (const reg of registrations) {
			await reg.unregister();
			console.log("Development mode (browser): Unregistered Service Worker.");
		}
		return undefined;
	}

	return navigator.serviceWorker.register("/pwa/sw.js", { scope });
}
