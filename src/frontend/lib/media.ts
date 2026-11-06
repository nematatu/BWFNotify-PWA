export const safeHttpsUrl = (url: unknown) =>
	String(url || "").replace(/^http:\/\//, "https://");

/** BWFの画像はWorkerの `/api/media` を経由して表示する。 */
export const proxiedImageUrl = (url: unknown) =>
	url ? `/api/media?url=${encodeURIComponent(safeHttpsUrl(url))}` : "";
