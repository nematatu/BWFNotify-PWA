export function proxiedImageUrl(value: unknown): string {
	if (!value) return "";
	const url = safeHttpsUrl(value);
	return `/api/media?url=${encodeURIComponent(url)}`;
}

export function safeHttpsUrl(value: unknown): string {
	if (!value) return "";
	const s = String(value);
	return s.startsWith("http://") ? s.replace("http://", "https://") : s;
}

export function youtubeLink(value?: string | null): string {
	if (!value) return "";
	return value;
}
