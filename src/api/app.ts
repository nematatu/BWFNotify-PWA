import { Hono } from "hono";
import type { MatchSummary, PublicState } from "../type";
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
	updateSubscriptionExclusions,
} from "./push";

const STATE_KEY = "push:state";
const NOTIFIED_PREFIX = "push:notified:";
const NOTIFIED_TTL_SECONDS = 30 * 24 * 60 * 60;
const MAX_REQUEST_BYTES = 4096;

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", async (c, next) => {
	await next();
	if (c.req.path !== "/api/media") {
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

app.get("/api/status", async (c) => {
	const state = await c.env.NOTIFIED_MATCHES.get<PublicState>(
		STATE_KEY,
		"json",
	);
	return c.json(state || { checkedAt: null, matches: [] });
});

app.post("/api/subscriptions", async (c) => {
	if (requestTooLarge(c.req.header("content-length"))) {
		return c.json({ error: "Request is too large" }, 413);
	}

	const subscription = parsePushSubscription(await readJson(c.req.raw));
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

	const body = object(await readJson(c.req.raw));
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

export async function runNotificationCheck(env: Env): Promise<void> {
	const matches = await fetchJapaneseMatches(env.NOTIFIED_MATCHES);
	const liveMatches = matches.filter((match) => match.eventType === "live");
	const checkedAt = new Date().toISOString();
	await env.NOTIFIED_MATCHES.put(
		STATE_KEY,
		JSON.stringify({ checkedAt, matches } satisfies PublicState),
	);

	const newMatches = await withoutNotifiedMatches(
		env.NOTIFIED_MATCHES,
		liveMatches,
	);
	const delivery =
		newMatches.length > 0
			? await sendPushNotifications(env, newMatches)
			: { sent: 0, failed: 0, removed: 0 };

	if (delivery.sent > 0) {
		await Promise.all(
			newMatches.map((match) =>
				env.NOTIFIED_MATCHES.put(notifiedKey(match), checkedAt, {
					expirationTtl: NOTIFIED_TTL_SECONDS,
				}),
			),
		);
	}

	console.log(
		JSON.stringify({
			event: "notification-check",
			liveMatches: liveMatches.length,
			scheduledMatches: matches.length - liveMatches.length,
			newMatches: newMatches.length,
			...delivery,
		}),
	);
}

async function withoutNotifiedMatches(
	kv: KVNamespace,
	matches: MatchSummary[],
): Promise<MatchSummary[]> {
	const records = await Promise.all(
		matches.map((match) => kv.get(notifiedKey(match))),
	);
	return matches.filter((_, index) => records[index] == null);
}

function notifiedKey(match: MatchSummary): string {
	return `${NOTIFIED_PREFIX}${match.id}:live`;
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
