import { describe, expect, test } from "bun:test";

/** sw.js を、ブラウザの代わりの最小限の環境で動かし、fetch イベントの応答を確かめる。 */
async function loadServiceWorker(options: {
	cached: Response | undefined;
	network: () => Promise<Response>;
}) {
	const source = (await Bun.file("src/frontend/pwa/sw.js").text())
		.replace("__CACHE_NAME__", JSON.stringify("test-cache"))
		.replace("__APP_SHELL__", JSON.stringify(["/"]));
	const listeners = new Map<string, (event: unknown) => void>();
	let networkCalls = 0;
	const self = {
		location: { origin: "https://example.com" },
		addEventListener: (type: string, listener: (event: unknown) => void) =>
			listeners.set(type, listener),
	};
	const caches = { match: async () => options.cached };
	const fetch = () => {
		networkCalls += 1;
		return options.network();
	};
	new Function("self", "caches", "fetch", source)(self, caches, fetch);

	const navigate = async () => {
		let responded: Promise<Response> | undefined;
		listeners.get("fetch")?.({
			request: { method: "GET", mode: "navigate", url: "https://example.com/" },
			respondWith: (response: Promise<Response>) => {
				responded = response;
			},
		});
		return responded;
	};
	return { navigate, networkCalls: () => networkCalls };
}

describe("service worker navigation", () => {
	test("opens the saved screen without waiting for the network", async () => {
		const sw = await loadServiceWorker({
			cached: new Response("cached shell"),
			network: () => new Promise(() => {}),
		});
		const response = await sw.navigate();
		expect(await response?.text()).toBe("cached shell");
		expect(sw.networkCalls()).toBe(0);
	});

	test("fetches the screen when nothing is saved yet", async () => {
		const sw = await loadServiceWorker({
			cached: undefined,
			network: async () => new Response("network shell"),
		});
		const response = await sw.navigate();
		expect(await response?.text()).toBe("network shell");
		expect(sw.networkCalls()).toBe(1);
	});
});
