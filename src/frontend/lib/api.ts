const API_TIMEOUT_MS = 15_000;

function extractError(payload: unknown): string | undefined {
	if (payload && typeof payload === "object") {
		const err = (payload as Record<string, unknown>).error;
		return typeof err === "string" ? err : undefined;
	}
	return undefined;
}

export function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return "処理に失敗しました";
}

export async function api<T>(
	path: string,
	options: RequestInit = {},
): Promise<T> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
	try {
		const response = await fetch(path, {
			...options,
			headers: {
				...(options.body ? { "content-type": "application/json" } : {}),
				...options.headers,
			},
			signal: controller.signal,
		});
		const payload: unknown = await response.json();
		if (!response.ok) {
			const err = extractError(payload);
			throw new Error(err || `Request failed (${response.status})`);
		}
		return payload as T;
	} finally {
		clearTimeout(timer);
	}
}
