import { afterEach, describe, expect, mock, test } from "bun:test";
import { allowedBwfImageUrl, fetchBwfImage } from "../src/api/media";

describe("fetchBwfImage cache", () => {
	const originalFetch = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	const imageUrl =
		"https://img.bwfbadminton.com/image/upload/v1/assets/players/1.jpg";
	const cacheKey = `https://app.example/api/media?url=${encodeURIComponent(imageUrl)}`;

	/** Workerのエッジキャッシュの代わりに、URLごとに保存するだけの入れ物 */
	const memoryCache = () => {
		const store = new Map<string, Response>();
		return {
			store,
			cache: {
				match: async (request: Request) => store.get(request.url)?.clone(),
				put: async (request: Request, response: Response) => {
					store.set(request.url, response);
				},
			} as unknown as Cache,
		};
	};

	test("BWFから取得した画像を保存し、2回目はBWFへ取りに行かない", async () => {
		const upstream = mock(
			async () =>
				new Response("jpeg", { headers: { "content-type": "image/jpeg" } }),
		);
		globalThis.fetch = upstream as unknown as typeof fetch;
		const { cache, store } = memoryCache();
		const pending: Promise<unknown>[] = [];
		const options = {
			cache,
			cacheKey,
			waitUntil: (promise: Promise<unknown>) => {
				pending.push(promise);
			},
		};

		const first = await fetchBwfImage(imageUrl, options);
		await Promise.all(pending);
		expect(first.headers.get("X-BWF-Cache")).toBe("MISS");
		expect(store.has(cacheKey)).toBe(true);

		const second = await fetchBwfImage(imageUrl, options);
		expect(second.headers.get("X-BWF-Cache")).toBe("HIT");
		expect(await second.text()).toBe("jpeg");
		expect(upstream).toHaveBeenCalledTimes(1);
	});

	test("取得に失敗した画像は保存しない", async () => {
		globalThis.fetch = (async () =>
			new Response("", { status: 404 })) as unknown as typeof fetch;
		const { cache, store } = memoryCache();
		const response = await fetchBwfImage(imageUrl, {
			cache,
			cacheKey,
			waitUntil: () => {},
		});
		expect(response.status).toBe(502);
		expect(store.size).toBe(0);
	});
});

describe("allowedBwfImageUrl", () => {
	test("accepts BWF Cloudinary image URLs", () => {
		expect(
			allowedBwfImageUrl(
				"https://img.bwfbadminton.com/image/upload/v1/assets/players/1.jpg",
			)?.hostname,
		).toBe("img.bwfbadminton.com");
	});

	test("accepts resized BWF images requested by the screen", () => {
		expect(
			allowedBwfImageUrl(
				"https://img.bwfbadminton.com/image/upload/c_fill,g_face,w_144,h_144,q_auto/v1590501423/assets/players/thumbnail/39276.jpg",
			)?.hostname,
		).toBe("img.bwfbadminton.com");
	});

	test("accepts BWF tournament fallback images", () => {
		expect(
			allowedBwfImageUrl(
				"https://extranet.bwfbadminton.com/images/player-hero-01.jpg",
			)?.hostname,
		).toBe("extranet.bwfbadminton.com");
	});

	test.each([
		"http://img.bwfbadminton.com/image/upload/v1/player.jpg",
		"https://example.com/image/upload/v1/player.jpg",
		"https://img.bwfbadminton.com/other/player.jpg",
		"https://extranet.bwfbadminton.com/docs/private.jpg",
	] as const)("rejects %s", (url) => {
		expect(allowedBwfImageUrl(url)).toBeNull();
	});
});
