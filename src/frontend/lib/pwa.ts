export async function registerServiceWorker(
	scope = "/",
): Promise<ServiceWorkerRegistration | undefined> {
	if (!("serviceWorker" in navigator)) {
		throw new Error("Service Worker is not supported in this browser.");
	}

	if (import.meta.env.DEV) {
		await clearDevelopmentPwaStorage(
			navigator.serviceWorker,
			typeof caches === "undefined" ? undefined : caches,
		);
		return undefined;
	}

	return navigator.serviceWorker.register("/pwa/sw.js", { scope });
}

export async function clearDevelopmentPwaStorage(
	serviceWorkers: {
		getRegistrations(): Promise<
			readonly Pick<ServiceWorkerRegistration, "unregister">[]
		>;
	},
	cacheStorage?: Pick<CacheStorage, "keys" | "delete">,
): Promise<void> {
	const registrations = await serviceWorkers.getRegistrations();
	await Promise.allSettled(
		registrations.map((registration) => registration.unregister()),
	);
	if (!cacheStorage) return;
	const cacheNames = await cacheStorage.keys();
	await Promise.allSettled(cacheNames.map((name) => cacheStorage.delete(name)));
}
