import { afterEach, describe, expect, test } from "bun:test";
import { type ApiError, api, errorMessage } from "../src/frontend/lib/api";

describe("api", () => {
	const originalFetch = globalThis.fetch;
	const originalError = console.error;
	afterEach(() => {
		globalThis.fetch = originalFetch;
		console.error = originalError;
	});

	const respond = (response: Response | Error) => {
		globalThis.fetch = (async () => {
			if (response instanceof Error) throw response;
			return response;
		}) as unknown as typeof fetch;
	};

	/** apiの失敗を受け取り、画面に出る文言とApiErrorの中身を返す。 */
	const failure = async () => {
		try {
			await api("/api/subscriptions");
		} catch (error) {
			return { error: error as ApiError, shown: errorMessage(error) };
		}
		throw new Error("api did not fail");
	};

	test("成功した応答はJSONを返す", async () => {
		respond(Response.json({ ok: true }));
		expect(await api("/api/config")).toEqual({ ok: true });
	});

	test("サーバーの英語の文言は画面に出さず、調査用に残す", async () => {
		respond(
			Response.json({ error: "Push subscription expired" }, { status: 410 }),
		);
		const { error, shown } = await failure();
		expect(shown).toBe(
			"通知の登録が見つかりません。通知をオンにし直してください",
		);
		expect(error.status).toBe(410);
		expect(error.detail).toBe("Push subscription expired");
	});

	test("HTMLのエラー応答でもJSONの読み込みエラーを出さない", async () => {
		respond(
			new Response("<html>Bad gateway</html>", {
				status: 502,
				headers: { "content-type": "text/html" },
			}),
		);
		const { shown } = await failure();
		expect(shown).toBe(
			"サーバーで問題が発生しました。時間をおいて再度お試しください",
		);
	});

	test("成功でもJSONとして読めない応答はエラーにする", async () => {
		respond(new Response("not json", { status: 200 }));
		const { shown } = await failure();
		expect(shown).toBe("サーバーの応答を読み取れませんでした");
	});

	test("通信できないときは接続の確認を促す", async () => {
		respond(new TypeError("Failed to fetch"));
		const { shown } = await failure();
		expect(shown).toBe("通信できませんでした。接続を確認してください");
	});

	test("API以外の想定外のエラーは英語の文言を出さない", () => {
		console.error = () => {};
		expect(errorMessage(new Error("Registration failed"))).toBe(
			"処理に失敗しました",
		);
		expect(
			errorMessage(new DOMException("permission denied", "NotAllowedError")),
		).toBe("通知が許可されませんでした");
	});
});
