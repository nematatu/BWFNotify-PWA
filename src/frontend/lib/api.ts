const REQUEST_TIMEOUT_MS = 15_000;
const FALLBACK_MESSAGE = "処理に失敗しました";

/**
 * Worker APIの失敗。`message` は画面にそのまま出せる日本語にし、
 * サーバーが返した英語の文言は `detail` として調査用に残す。
 */
export class ApiError extends Error {
	constructor(
		message: string,
		readonly status: number | null,
		readonly detail?: string,
	) {
		super(message);
		this.name = "ApiError";
	}
}

/** 画面に出すエラー文言。内部の英語メッセージは出さない。 */
export const errorMessage = (error: unknown): string => {
	if (error instanceof ApiError) return error.message;
	if (error instanceof DOMException && error.name === "NotAllowedError") {
		return "通知が許可されませんでした";
	}
	console.error(error);
	return FALLBACK_MESSAGE;
};

/** Worker APIをJSONで呼び出す。失敗はApiErrorにする。 */
export async function api<T>(
	path: string,
	options: RequestInit = {},
): Promise<T> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	try {
		let response: Response;
		try {
			response = await fetch(path, {
				...options,
				headers: {
					...(options.body ? { "content-type": "application/json" } : {}),
					...options.headers,
				},
				signal: controller.signal,
			});
		} catch (error) {
			throw controller.signal.aborted
				? new ApiError("通信がタイムアウトしました", null, String(error))
				: new ApiError(
						"通信できませんでした。接続を確認してください",
						null,
						String(error),
					);
		}

		// 502などでHTMLが返る場合もあるため、JSONとして読めない応答も扱う。
		const payload: unknown = await response.json().catch(() => undefined);
		if (!response.ok) {
			throw new ApiError(
				statusMessage(response.status),
				response.status,
				apiErrorMessage(payload),
			);
		}
		if (payload === undefined) {
			throw new ApiError(
				"サーバーの応答を読み取れませんでした",
				response.status,
			);
		}
		return payload as T;
	} finally {
		clearTimeout(timer);
	}
}

/** HTTPステータスから、利用者が次に何をすればよいか分かる文言を返す。 */
export function statusMessage(status: number): string {
	if (status === 404 || status === 410) {
		return "通知の登録が見つかりません。通知をオンにし直してください";
	}
	if (status === 400 || status === 413) return "送信内容が正しくありません";
	if (status === 403) return "この環境では利用できません";
	if (status === 429) {
		return "混み合っています。時間をおいて再度お試しください";
	}
	if (status >= 500) {
		return "サーバーで問題が発生しました。時間をおいて再度お試しください";
	}
	return `${FALLBACK_MESSAGE}（${status}）`;
}

function apiErrorMessage(payload: unknown): string | undefined {
	if (!payload || typeof payload !== "object") return undefined;
	const error = (payload as Record<string, unknown>).error;
	return typeof error === "string" ? error : undefined;
}
