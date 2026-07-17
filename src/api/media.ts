const BWF_IMAGE_HOST = "img.bwfbadminton.com";
const BWF_IMAGE_PATH_PREFIX = "/image/upload/";
const MAX_IMAGE_URL_LENGTH = 2048;

export function allowedBwfImageUrl(value: string | undefined): URL | null {
	if (!value || value.length > MAX_IMAGE_URL_LENGTH) {
		return null;
	}

	try {
		const url = new URL(value);
		return url.protocol === "https:" &&
			url.hostname === BWF_IMAGE_HOST &&
			url.port === "" &&
			url.pathname.startsWith(BWF_IMAGE_PATH_PREFIX)
			? url
			: null;
	} catch {
		return null;
	}
}

export async function fetchBwfImage(
	value: string | undefined,
): Promise<Response> {
	const url = allowedBwfImageUrl(value);
	if (!url) {
		return new Response("Invalid image URL", { status: 400 });
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
		"Cache-Control": "public, max-age=86400",
		"Content-Type": contentType,
		"Cross-Origin-Resource-Policy": "same-origin",
		"X-Content-Type-Options": "nosniff",
	});
	const etag = upstream.headers.get("etag");
	if (etag) {
		headers.set("ETag", etag);
	}
	return new Response(upstream.body, { headers });
}
