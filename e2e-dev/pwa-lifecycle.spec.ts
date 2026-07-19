import { expect, test } from "@playwright/test";

async function storageCounts(page: import("@playwright/test").Page) {
	return page.evaluate(async () => ({
		registrations: (await navigator.serviceWorker.getRegistrations()).length,
		caches: (await window.caches.keys()).length,
	}));
}

async function createLegacyPwaState(page: import("@playwright/test").Page) {
	await page.evaluate(async () => {
		const cache = await window.caches.open("legacy-bwfnotify-shell");
		await cache.put("/", new Response("stale application shell"));
		await navigator.serviceWorker.register("/pwa/sw.js", { scope: "/" });
	});
}

test("development origins remove PWA registrations and offline caches", async ({
	page,
}) => {
	await page.goto("http://localhost:5173/");
	await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);
	expect(
		(
			await page.request.get("http://localhost:5173/pwa/manifest.webmanifest")
		).status(),
	).toBe(404);
	await createLegacyPwaState(page);
	await expect
		.poll(() => storageCounts(page))
		.toEqual({
			registrations: 0,
			caches: 0,
		});

	const apiPage = await page.goto("http://localhost:8787/");
	expect(apiPage?.status()).toBe(410);
	await expect(page.locator("html")).toHaveAttribute(
		"data-pwa-cleanup",
		"done",
	);
	await createLegacyPwaState(page);
	await expect
		.poll(() => storageCounts(page))
		.toEqual({
			registrations: 0,
			caches: 0,
		});
});
