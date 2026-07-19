import { describe, expect, test } from "bun:test";
import { developmentPwaResponse } from "../src/api/developmentPwa";
import { clearDevelopmentPwaStorage } from "../src/frontend/lib/pwa";

describe("development PWA isolation", () => {
	test("keeps the development Worker API-only and aligned with runtime config", async () => {
		const production = JSON.parse(await Bun.file("wrangler.jsonc").text());
		const development = JSON.parse(await Bun.file("wrangler.dev.jsonc").text());
		expect(development.main).toBe("src/api/development.ts");
		expect(development.assets).toBeUndefined();
		expect(development.compatibility_date).toBe(production.compatibility_date);
		expect(development.compatibility_flags).toEqual(
			production.compatibility_flags,
		);
		expect(development.kv_namespaces).toEqual(production.kv_namespaces);
	});

	test("serves a self-removing service worker without offline fetch handling", async () => {
		const response = developmentPwaResponse(
			new Request("http://localhost:8787/pwa/sw.js"),
		);
		const worker = await response.text();
		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(response.headers.get("Service-Worker-Allowed")).toBe("/");
		expect(worker).toContain("self.registration.unregister()");
		expect(worker).toContain("caches.delete(name)");
		expect(worker).not.toContain('addEventListener("fetch"');
	});

	test("does not serve the production app from the development API origin", async () => {
		const response = developmentPwaResponse(
			new Request("http://localhost:8787/"),
		);
		const html = await response.text();
		expect(response.status).toBe(410);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(response.headers.get("Clear-Site-Data")).toBe('"cache", "storage"');
		expect(html).toContain("localhost:5173");
		expect(html).toContain("getRegistrations()");
		expect(html).not.toContain('rel="manifest"');
	});

	test("removes every registration and cache even when one removal fails", async () => {
		const calls: string[] = [];
		await clearDevelopmentPwaStorage(
			{
				getRegistrations: async () => [
					{
						unregister: async () => {
							calls.push("registration-1");
							throw new Error("stale registration");
						},
					},
					{
						unregister: async () => {
							calls.push("registration-2");
							return true;
						},
					},
				],
			},
			{
				keys: async () => ["old-shell", "old-runtime"],
				delete: async (name) => {
					calls.push(name);
					return true;
				},
			},
		);
		expect(calls).toEqual([
			"registration-1",
			"registration-2",
			"old-shell",
			"old-runtime",
		]);
	});
});
