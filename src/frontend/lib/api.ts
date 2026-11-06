const REQUEST_TIMEOUT_MS = 15_000;

export const errorMessage = (error: unknown) =>
	error instanceof Error ? error.message : "処理に失敗しました";

/** Worker APIをJSONで呼び出す。エラー応答は `error` の文言で例外にする。 */
export async function api<T>(
	path: string,
	options: RequestInit = {},
): Promise<T> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	try {
		const response = await fetch(path, {
			...options,
			headers: {
				...(options.body ? { "content-type": "application/json" } : {}),
				...options.headers,
			},
			signal: controller.signal,
		});
		const payload = await response.json();
		if (!response.ok) {
			throw new Error(
				apiErrorMessage(payload) || `Request failed (${response.status})`,
			);
		}
		return payload as T;
	} finally {
		clearTimeout(timer);
	}
}

function apiErrorMessage(payload: unknown): string | undefined {
	if (!payload || typeof payload !== "object") return undefined;
	const error = (payload as Record<string, unknown>).error;
	return typeof error === "string" ? error : undefined;
}
