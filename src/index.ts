import { Hono } from "hono";
import { fetchJapaneseLiveMatches } from "./bwf";
import {
	deleteSubscription,
	getSavedSubscription,
	parsePushSubscription,
	saveSubscription,
	sendPushNotifications,
	sendTestPushNotification,
} from "./push";
import type { LiveMatch, PublicState } from "./types";
import { errorMessage, object, optionalString } from "./utils";

const STATE_KEY = "push:state";
const NOTIFIED_PREFIX = "push:notified:";
const NOTIFIED_TTL_SECONDS = 30 * 24 * 60 * 60;
const MAX_REQUEST_BYTES = 4096;

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", async (c, next) => {
	await next();
	c.header("Cache-Control", "no-store");
	c.header("X-Content-Type-Options", "nosniff");
});

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

	await saveSubscription(
		c.env.NOTIFIED_MATCHES,
		subscription,
		c.req.header("user-agent"),
	);
	return c.json({ ok: true }, 201);
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

app.post("/api/notifications/test", async (c) => {
	if (requestTooLarge(c.req.header("content-length"))) {
		return c.json({ error: "Request is too large" }, 413);
	}

	const subscription = parsePushSubscription(await readJson(c.req.raw));
	if (!subscription) {
		return c.json({ error: "Invalid push subscription" }, 400);
	}

	const saved = await getSavedSubscription(
		c.env.NOTIFIED_MATCHES,
		subscription,
	);
	if (!saved) {
		return c.json({ error: "Push subscription not found" }, 404);
	}

	const delivery = await sendTestPushNotification(c.env, saved);
	if (delivery.sent !== 1) {
		return c.json({ error: "Push delivery failed" }, 502);
	}
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
	const matches = await fetchJapaneseLiveMatches();
	const checkedAt = new Date().toISOString();
	await env.NOTIFIED_MATCHES.put(
		STATE_KEY,
		JSON.stringify({ checkedAt, matches } satisfies PublicState),
	);

	const newMatches = await withoutNotifiedMatches(
		env.NOTIFIED_MATCHES,
		matches,
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
			liveMatches: matches.length,
			newMatches: newMatches.length,
			...delivery,
		}),
	);
}

async function withoutNotifiedMatches(
	kv: KVNamespace,
	matches: LiveMatch[],
): Promise<LiveMatch[]> {
	const records = await Promise.all(
		matches.map((match) => kv.get(notifiedKey(match))),
	);
	return matches.filter((_, index) => records[index] == null);
}

function notifiedKey(match: LiveMatch): string {
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
