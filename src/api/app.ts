import { type Context, Hono } from "hono";
import type {
	DeliveryResult,
	MatchSummary,
	PublicState,
	SaveSubscriptionRequest,
	TestNotificationRequest,
	UpdateSubscriptionPreferencesRequest,
} from "../type";
import { errorMessage, object, optionalString } from "../utils";
import { fetchJapaneseMatches } from "./bwf";
import { fetchBwfImage } from "./media";
import {
	deleteSubscription,
	isAllowedPushEndpoint,
	parseExcludedMatchIds,
	parsePushSubscription,
	saveSubscription,
	sendPushNotifications,
	sendTestNotification,
	updateSubscriptionExclusions,
} from "./push";

const STATE_KEY = "push:state";
const MAX_REQUEST_BYTES = 4096;
const STATUS_CACHE_TTL_SECONDS = 30;
const LIVE_CACHE_TTL_SECONDS = 10;
const NOTIFICATION_DEDUP_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const STATE_MAX_AGE_MS = 5 * 60 * 1000;
export const MAX_NOTIFICATION_ATTEMPTS = 3;

type StoredState = PublicState & {
	notificationAttempts?: Record<string, number>;
	notifiedLiveMatches?: Record<string, string>;
};

type NotificationCheckDependencies = {
	fetchMatches: (
		cache: KVNamespace,
		knownMatches: MatchSummary[],
	) => Promise<MatchSummary[]>;
	sendNotifications: (
		env: Env,
		matches: MatchSummary[],
	) => Promise<DeliveryResult>;
	now: () => Date;
};

export type NotificationCheckResult = DeliveryResult & {
	liveMatches: number;
	scheduledMatches: number;
	newMatches: number;
	stateWritten: boolean;
};

type AppBindings = { Bindings: Env };

const app = new Hono<AppBindings>();

app.use("/api/*", async (c, next) => {
	await next();
	if (
		c.req.path !== "/api/media" &&
		c.req.path !== "/api/status" &&
		c.req.path !== "/api/live"
	) {
		c.header("Cache-Control", "no-store");
	}
	c.header("X-Content-Type-Options", "nosniff");
});

app.get("/api/media", (c) => fetchBwfImage(c.req.query("url")));

app.get("/api/config", (c) =>
	c.json({
		vapidPublicKey: c.env.VAPID_PUBLIC_KEY,
		targetCountry: "JPN",
	}),
);

app.get("/api/status", (c) =>
	cachedJson(c, STATUS_CACHE_TTL_SECONDS, async () => {
		const stored = await c.env.NOTIFIED_MATCHES.get<StoredState>(
			STATE_KEY,
			"json",
		);

		const host = c.req.header("host") || "";
		const isLocalDev = host.includes("localhost") || host.includes("127.0.0.1");

		if (isLocalDev) {
			c.executionCtx.waitUntil(
				runNotificationCheck(c.env).catch((err) => {
					console.error("Local dev auto-sync failed:", err);
				}),
			);
		}

		return publicState(stored);
	}),
);

app.get("/api/live", (c) =>
	cachedJson(c, LIVE_CACHE_TTL_SECONDS, async () => ({
		checkedAt: new Date().toISOString(),
		matches: (
			await fetchJapaneseMatches(undefined, [], {
				upstreamCacheTtlSeconds: LIVE_CACHE_TTL_SECONDS,
				resolveYoutubeStreams: false,
			})
		).filter((match) => match.eventType === "live"),
	})),
);

app.post("/api/subscriptions", async (c) => {
	if (requestTooLarge(c.req.header("content-length"))) {
		return c.json({ error: "Request is too large" }, 413);
	}

	const body = object(
		await readJson(c.req.raw),
	) as Partial<SaveSubscriptionRequest>;
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

app.patch("/api/subscriptions", async (c) => {
	if (requestTooLarge(c.req.header("content-length"))) {
		return c.json({ error: "Request is too large" }, 413);
	}

	const body = object(
		await readJson(c.req.raw),
	) as Partial<UpdateSubscriptionPreferencesRequest>;
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

app.post("/api/subscriptions/test", async (c) => {
	if (requestTooLarge(c.req.header("content-length"))) {
		return c.json({ error: "Request is too large" }, 413);
	}

	const body = object(
		await readJson(c.req.raw),
	) as Partial<TestNotificationRequest>;
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

app.delete("/api/subscriptions", async (c) => {
	if (requestTooLarge(c.req.header("content-length"))) {
		return c.json({ error: "Request is too large" }, 413);
	}

	const endpoint = optionalString(object(await readJson(c.req.raw)).endpoint);
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

export async function runNotificationCheck(
	env: Env,
	overrides: Partial<NotificationCheckDependencies> = {},
): Promise<NotificationCheckResult> {
	const dependencies: NotificationCheckDependencies = {
		fetchMatches: fetchJapaneseMatches,
		sendNotifications: sendPushNotifications,
		now: () => new Date(),
		...overrides,
	};
	const previous = await env.NOTIFIED_MATCHES.get<StoredState>(
		STATE_KEY,
		"json",
	);
	const matches = await dependencies.fetchMatches(
		env.NOTIFIED_MATCHES,
		previous?.matches || [],
	);
	const liveMatches = matches.filter((match) => match.eventType === "live");
	const newMatches = notificationCandidates(previous, liveMatches);
	const delivery =
		newMatches.length > 0
			? await dependencies.sendNotifications(env, newMatches)
			: { sent: 0, failed: 0, removed: 0, byMatch: {} };
	const now = dependencies.now();
	const next: StoredState = {
		checkedAt: now.toISOString(),
		matches,
	};
	const notificationAttempts = nextNotificationAttempts(
		previous,
		liveMatches,
		newMatches,
		delivery,
	);
	next.notificationAttempts = notificationAttempts;
	next.notifiedLiveMatches = nextNotifiedLiveMatches(
		previous,
		newMatches,
		notificationAttempts,
		now,
	);
	const stateWritten = shouldPersistState(previous, next, now);
	if (stateWritten) {
		await env.NOTIFIED_MATCHES.put(STATE_KEY, JSON.stringify(next));
	}

	const result: NotificationCheckResult = {
		liveMatches: liveMatches.length,
		scheduledMatches: matches.length - liveMatches.length,
		newMatches: newMatches.length,
		stateWritten,
		...delivery,
	};
	console.log(JSON.stringify({ event: "notification-check", ...result }));
	console.log(
		JSON.stringify({
			event: "notification-check-detail",
			previousLiveIds: (previous?.matches || [])
				.filter((m) => m.eventType === "live")
				.map((m) => m.id),
			notifiedLiveMatchIds: Object.keys(previous?.notifiedLiveMatches || {}),
			notificationAttempts: previous?.notificationAttempts || {},
			currentLiveIds: liveMatches.map((m) => m.id),
			candidateIds: newMatches.map((m) => m.id),
		}),
	);
	return result;
}

export function shouldPersistState(
	previous: StoredState | null,
	next: StoredState,
	now: Date,
): boolean {
	if (!previous) {
		return true;
	}
	if (
		matchStateSignature(previous.matches) !==
			matchStateSignature(next.matches) ||
		JSON.stringify(previous.notificationAttempts || {}) !==
			JSON.stringify(next.notificationAttempts || {}) ||
		JSON.stringify(previous.notifiedLiveMatches || {}) !==
			JSON.stringify(next.notifiedLiveMatches || {})
	) {
		return true;
	}
	const previousCheck = previous.checkedAt
		? Date.parse(previous.checkedAt)
		: Number.NaN;
	return (
		!Number.isFinite(previousCheck) ||
		now.getTime() - previousCheck >= STATE_MAX_AGE_MS
	);
}

function matchStateSignature(matches: MatchSummary[]): string {
	return JSON.stringify(
		[...matches].sort((left, right) => left.id.localeCompare(right.id)),
	);
}

function notificationCandidates(
	previous: StoredState | null,
	liveMatches: MatchSummary[],
): MatchSummary[] {
	const previousLiveIds = new Set(
		(previous?.matches || [])
			.filter((match) => match.eventType === "live")
			.map((match) => match.id),
	);
	return liveMatches.filter((match) => {
		const attempts = previous?.notificationAttempts?.[match.id] || 0;
		return (
			(attempts > 0 && attempts < MAX_NOTIFICATION_ATTEMPTS) ||
			(!previousLiveIds.has(match.id) &&
				!previous?.notifiedLiveMatches?.[match.id])
		);
	});
}

function nextNotificationAttempts(
	previous: StoredState | null,
	liveMatches: MatchSummary[],
	candidates: MatchSummary[],
	delivery: DeliveryResult,
): Record<string, number> {
	const liveIds = new Set(liveMatches.map((match) => match.id));
	const next = Object.fromEntries(
		Object.entries(previous?.notificationAttempts || {}).filter(
			([id, attempts]) =>
				liveIds.has(id) && attempts > 0 && attempts < MAX_NOTIFICATION_ATTEMPTS,
		),
	);
	for (const match of candidates) {
		delete next[match.id];
		const matchDelivery = delivery.byMatch[match.id];
		if (matchDelivery && matchDelivery.sent === 0 && matchDelivery.failed > 0) {
			const attempts = (previous?.notificationAttempts?.[match.id] || 0) + 1;
			if (attempts < MAX_NOTIFICATION_ATTEMPTS) {
				next[match.id] = attempts;
			}
		}
	}
	return next;
}

function nextNotifiedLiveMatches(
	previous: StoredState | null,
	candidates: MatchSummary[],
	notificationAttempts: Record<string, number>,
	now: Date,
): Record<string, string> {
	const cutoff = now.getTime() - NOTIFICATION_DEDUP_AGE_MS;
	const next = Object.fromEntries(
		Object.entries(previous?.notifiedLiveMatches || {}).filter(([, value]) => {
			const timestamp = Date.parse(value);
			return Number.isFinite(timestamp) && timestamp >= cutoff;
		}),
	);

	// Migration: when upgrading from a version without notifiedLiveMatches,
	// seed the ledger with any matches already live to prevent double-sending.
	// Skip this block once notifiedLiveMatches exists so that genuinely new
	// live matches are not silently registered as already-notified.
	if (!previous?.notifiedLiveMatches) {
		for (const match of previous?.matches || []) {
			if (
				match.eventType === "live" &&
				!previous?.notificationAttempts?.[match.id]
			) {
				next[match.id] = previous?.checkedAt || now.toISOString();
			}
		}
	}
	for (const match of candidates) {
		if (!notificationAttempts[match.id]) {
			next[match.id] = now.toISOString();
		}
	}
	return next;
}

function publicState(state: StoredState | null): PublicState {
	return {
		checkedAt: state?.checkedAt || null,
		matches: Array.isArray(state?.matches) ? state.matches : [],
	};
}

async function cachedJson(
	c: Context<AppBindings>,
	ttlSeconds: number,
	load: () => Promise<unknown>,
): Promise<Response> {
	const cacheUrl = new URL(c.req.url);
	cacheUrl.search = "";
	const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });
	interface WorkerCache {
		match(req: Request): Promise<Response | undefined>;
		put(req: Request, res: Response): Promise<void>;
	}
	const cached = await (
		caches as unknown as { default: WorkerCache }
	).default.match(cacheKey);
	if (cached) {
		const response = new Response(cached.body, cached);
		response.headers.set("X-BWF-Cache", "HIT");
		return response;
	}

	const response = c.json(await load());
	response.headers.set("Cache-Control", `public, max-age=${ttlSeconds}`);
	response.headers.set("X-BWF-Cache", "MISS");
	c.executionCtx.waitUntil(
		(caches as unknown as { default: WorkerCache }).default.put(
			cacheKey,
			response.clone(),
		),
	);
	return response;
}

async function readJson(request: Request): Promise<unknown> {
	if (!request.headers.get("content-type")?.includes("application/json")) {
		return null;
	}

	try {
		return await request.json();
	} catch {
		return null;
	}
}

function requestTooLarge(contentLength: string | undefined): boolean {
	const size = Number(contentLength || 0);
	return Number.isFinite(size) && size > MAX_REQUEST_BYTES;
}
