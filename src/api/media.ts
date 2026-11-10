const BWF_IMAGE_SOURCES = new Map([
	["img.bwfbadminton.com", ["/image/upload/"]],
	["extranet.bwfbadminton.com", ["/images/"]],
]);
const MAX_IMAGE_URL_LENGTH = 2048;

export function allowedBwfImageUrl(value: string | undefined): URL | null {
	if (!value || value.length > MAX_IMAGE_URL_LENGTH) {
		return null;
	}

	try {
		const url = new URL(value);
		const prefixes = BWF_IMAGE_SOURCES.get(url.hostname);
		return url.protocol === "https:" &&
			url.port === "" &&
			prefixes?.some((prefix) => url.pathname.startsWith(prefix))
			? url
			: null;
	} catch {
		return null;
	}
}

/**
 * 画像のキャッシュ期間（秒）。BWFの画像URLは版番号（`v1658731272`）を含み、
 * 差し替え時はURLが変わるため長めに保持する。
 */
export const MEDIA_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;

export type MediaCacheOptions = {
	/** Workerのエッジキャッシュ。BWFからの取得は1枚数秒かかるため、取得済みの画像を使い回す */
	cache: Cache;
	/** 応答を返した後にキャッシュへ保存する */
	waitUntil: (promise: Promise<unknown>) => void;
	/** キャッシュの鍵。`/api/media?url=...` のリクエストURL */
	cacheKey: string;
};

export async function fetchBwfImage(
	value: string | undefined,
	options?: MediaCacheOptions,
): Promise<Response> {
	const url = allowedBwfImageUrl(value);
	if (!url) {
		return new Response("Invalid image URL", { status: 400 });
	}

	const cacheKey = options
		? new Request(options.cacheKey, { method: "GET" })
		: undefined;
	if (options && cacheKey) {
		const cached = await options.cache.match(cacheKey);
		if (cached) {
			const response = new Response(cached.body, cached);
			response.headers.set("X-BWF-Cache", "HIT");
			return response;
		}
	}

	const upstream = await fetch(url, {
		headers: {
			accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
			referer: "https://bwfbadminton.com/",
			"user-agent":
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
		},
	});
	if (!upstream.ok) {
		return new Response("Image is unavailable", { status: 502 });
	}

	const contentType = upstream.headers.get("content-type") || "";
	if (!/^image\/(?:avif|gif|jpeg|png|webp)(?:;|$)/i.test(contentType)) {
		return new Response("Unsupported image type", { status: 502 });
	}

	const headers = new Headers({
		// BWFへは常に同じAcceptで取得するため、利用者のAcceptでは中身が変わらない
		"Cache-Control": `public, max-age=${MEDIA_CACHE_TTL_SECONDS}`,
		"Content-Type": contentType,
		"Cross-Origin-Resource-Policy": "same-origin",
		"X-Content-Type-Options": "nosniff",
	});
	const etag = upstream.headers.get("etag");
	if (etag) {
		headers.set("ETag", etag);
	}
	const response = new Response(upstream.body, { headers });
	if (options && cacheKey) {
		options.waitUntil(options.cache.put(cacheKey, response.clone()));
		response.headers.set("X-BWF-Cache", "MISS");
	}
	return response;
}
