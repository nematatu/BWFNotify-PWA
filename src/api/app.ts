import { type Context, Hono, type MiddlewareHandler } from "hono";
import type {
	PublicState,
	SaveSubscriptionRequest,
	TestNotificationRequest,
	UpdateSubscriptionPreferencesRequest,
} from "../type";
import { errorMessage, object, optionalString } from "../utils";
import { fetchJapaneseMatches } from "./bwf";
import { fetchBwfImage } from "./media";
import {
	runNotificationCheck,
	STATE_KEY,
	type StoredState,
} from "./notificationCheck";
import {
	deleteSubscription,
	isAllowedPushEndpoint,
	parseExcludedMatchIds,
	parsePushSubscription,
	saveSubscription,
	sendTestNotification,
	updateSubscriptionExclusions,
} from "./push";
import { staticTournamentCalendar } from "./tournamentCalendar";
import { defaultWorkerCache } from "./workerCache";

const MAX_REQUEST_BYTES = 4096;
const STATUS_CACHE_TTL_SECONDS = 30;
const LIVE_CACHE_TTL_SECONDS = 10;
/**
 * BWFから取れず保存データを返したときのキャッシュ時間。保存データはCronが2分ごとに
 * 更新するだけなので、短い間隔でBWFへの失敗する取得を繰り返さない。
 */
const LIVE_FALLBACK_CACHE_TTL_SECONDS = 60;
/** 独自のCache-Controlを返すため、no-storeを付けないAPI。 */
const CACHEABLE_PATHS = new Set(["/api/media", "/api/status", "/api/live"]);

type AppBindings = { Bindings: Env };

const app = new Hono<AppBindings>();

app.use("/api/*", async (c, next) => {
	await next();
	if (!CACHEABLE_PATHS.has(c.req.path)) {
		c.header("Cache-Control", "no-store");
	}
	c.header("X-Content-Type-Options", "nosniff");
});

/**
 * Worker Previews（Pull Requestごとの確認用環境）か。
 * プレビューは本番と同じKVを読むため、購読データへの書き込みを止める。
 */
export function isPreview(env: Env): boolean {
	return String(env.APP_ENV) === "preview";
}

/** プレビューでは購読APIを使えなくし、本番の購読データを書き換えない。 */
app.use("/api/subscriptions/*", async (c, next) => {
	if (isPreview(c.env)) {
		return c.json({ error: "Notifications are disabled in previews" }, 403);
	}
	await next();
});

/** 購読APIの各ルートで、本文を読む前にサイズ上限を確認する。 */
const limitRequestSize: MiddlewareHandler<AppBindings> = async (c, next) => {
	if (requestTooLarge(c.req.header("content-length"))) {
		return c.json({ error: "Request is too large" }, 413);
	}
	await next();
};

// --- 試合情報 ---

app.get("/api/media", (c) =>
	fetchBwfImage(c.req.query("url"), {
		cache: defaultWorkerCache(),
		waitUntil: (promise) => c.executionCtx.waitUntil(promise),
		cacheKey: c.req.url,
	}),
);

app.get("/api/config", (c) =>
	c.json({
		vapidPublicKey: isPreview(c.env) ? undefined : c.env.VAPID_PUBLIC_KEY,
		targetCountry: "JPN",
		notificationsAvailable: !isPreview(c.env),
	}),
);

/** Cronが保存した全試合情報。利用者数に比例してKVを読まないようキャッシュする。 */
app.get("/api/status", (c) =>
	cachedJson(c, STATUS_CACHE_TTL_SECONDS, async () => {
		const stored = await c.env.NOTIFIED_MATCHES.get<StoredState>(
			STATE_KEY,
			"json",
		);
		return publicState(stored);
	}),
);

/**
 * 画面表示中だけ短い間隔で取得されるライブ得点。
 * BWFから取れないときはエラーにせず、Cronが保存した直近（最大2分前）のライブ試合を返す。
 */
app.get("/api/live", (c) =>
	cachedJson(c, liveCacheTtl, async () => {
		try {
			// 上流のキャッシュ指定は付けず、Cronと同じ取り方にする（応答は cachedJson が10秒キャッシュする）
			const matches = await fetchJapaneseMatches();
			return {
				checkedAt: new Date().toISOString(),
				source: "bwf",
				matches: matches.filter((match) => match.eventType === "live"),
			};
		} catch (error) {
			console.error(
				JSON.stringify({
					event: "live-fetch-error",
					error: errorMessage(error),
				}),
			);
			const stored = await c.env.NOTIFIED_MATCHES.get<StoredState>(
				STATE_KEY,
				"json",
			);
			return {
				checkedAt: stored?.checkedAt || null,
				source: "saved",
				matches: (Array.isArray(stored?.matches) ? stored.matches : []).filter(
					(match) => match.eventType === "live",
				),
			};
		}
	}),
);

// --- Push購読 ---

app.post("/api/subscriptions", limitRequestSize, async (c) => {
	const body = (await readJsonObject(
		c.req.raw,
	)) as Partial<SaveSubscriptionRequest>;
	const subscription = parsePushSubscription(body.subscription);
	if (!subscription) {
		return c.json({ error: "Invalid push subscription" }, 400);
	}

	const saved = await saveSubscription(
		c.env.NOTIFIED_MATCHES,
		subscription,
		c.req.header("user-agent"),
	);
	return c.json(
		{ ok: true, excludedMatchIds: saved.excludedMatchIds || [] },
		201,
	);
});

app.patch("/api/subscriptions", limitRequestSize, async (c) => {
	const body = (await readJsonObject(
		c.req.raw,
	)) as Partial<UpdateSubscriptionPreferencesRequest>;
	const endpoint = optionalString(body.endpoint);
	const excludedMatchIds = parseExcludedMatchIds(body.excludedMatchIds);
	if (!endpoint || !isAllowedPushEndpoint(endpoint) || !excludedMatchIds) {
		return c.json({ error: "Invalid notification preferences" }, 400);
	}

	const updated = await updateSubscriptionExclusions(
		c.env.NOTIFIED_MATCHES,
		endpoint,
		excludedMatchIds,
	);
	if (!updated) {
		return c.json({ error: "Push subscription not found" }, 404);
	}
	return c.json({ ok: true, excludedMatchIds: updated.excludedMatchIds || [] });
});

app.post("/api/subscriptions/test", limitRequestSize, async (c) => {
	const body = (await readJsonObject(
		c.req.raw,
	)) as Partial<TestNotificationRequest>;
	const endpoint = optionalString(body.endpoint);
	if (!endpoint || !isAllowedPushEndpoint(endpoint)) {
		return c.json({ error: "Invalid push endpoint" }, 400);
	}

	const result = await sendTestNotification(c.env, endpoint);
	if (result === "missing") {
		return c.json({ error: "Push subscription not found" }, 404);
	}
	if (result === "removed") {
		return c.json({ error: "Push subscription expired" }, 410);
	}
	return c.json({ ok: true });
});

app.delete("/api/subscriptions", limitRequestSize, async (c) => {
	const endpoint = optionalString((await readJsonObject(c.req.raw)).endpoint);
	if (!endpoint) {
		return c.json({ error: "Subscription endpoint is required" }, 400);
	}

	await deleteSubscription(c.env.NOTIFIED_MATCHES, endpoint);
	return c.json({ ok: true });
});

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((error, c) => {
	console.error(
		JSON.stringify({
			event: "api-error",
			path: c.req.path,
			error: errorMessage(error),
		}),
	);
	return c.json({ error: "Internal server error" }, 500);
});

export default {
	fetch: app.fetch,
	scheduled(_controller, env, ctx) {
		ctx.waitUntil(
			runNotificationCheck(env).catch((error) => {
				console.error(
					JSON.stringify({
						event: "notification-check-error",
						error: errorMessage(error),
					}),
				);
			}),
		);
	},
} satisfies ExportedHandler<Env>;

function publicState(state: StoredState | null): PublicState {
	return {
		checkedAt: state?.checkedAt || null,
		matches: Array.isArray(state?.matches) ? state.matches : [],
		recentResults: Array.isArray(state?.recentResults)
			? state.recentResults
			: [],
		calendarCheckedAt: state?.calendarCheckedAt || null,
		upcomingTournaments: staticTournamentCalendar(),
	};
}

/** Workerのエッジキャッシュに応答を保存し、TTL内はloadを呼ばずに返す。 */
/** BWFから取れたライブ得点は10秒、保存データで返したときは60秒キャッシュする。 */
function liveCacheTtl(body: unknown): number {
	return object(body).source === "saved"
		? LIVE_FALLBACK_CACHE_TTL_SECONDS
		: LIVE_CACHE_TTL_SECONDS;
}

async function cachedJson(
	c: Context<AppBindings>,
	ttlSeconds: number | ((body: unknown) => number),
	load: () => Promise<unknown>,
): Promise<Response> {
	const cacheUrl = new URL(c.req.url);
	cacheUrl.search = "";
	const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });
	const cache = defaultWorkerCache();
	const cached = await cache.match(cacheKey);
	if (cached) {
		const response = new Response(cached.body, cached);
		response.headers.set("X-BWF-Cache", "HIT");
		return response;
	}

	const body = await load();
	const ttl = typeof ttlSeconds === "function" ? ttlSeconds(body) : ttlSeconds;
	const response = c.json(body);
	response.headers.set("Cache-Control", `public, max-age=${ttl}`);
	response.headers.set("X-BWF-Cache", "MISS");
	c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
	return response;
}

/** JSON以外や壊れたJSONは空オブジェクトとして扱い、各ルートの検証で400にする。 */
async function readJsonObject(
	request: Request,
): Promise<Record<string, unknown>> {
	if (!request.headers.get("content-type")?.includes("application/json")) {
		return {};
	}

	try {
		return object(await request.json());
	} catch {
		return {};
	}
}

function requestTooLarge(contentLength: string | undefined): boolean {
	const size = Number(contentLength || 0);
	return Number.isFinite(size) && size > MAX_REQUEST_BYTES;
}
