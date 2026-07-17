import webpush, { type PushSubscription } from "web-push";
import type { DeliveryResult, MatchSummary, StoredSubscription } from "../type";
import { object, optionalString } from "../utils";

const SUBSCRIPTION_PREFIX = "push:subscription:";
const MAX_USER_AGENT_LENGTH = 240;
const MAX_EXCLUDED_MATCH_IDS = 50;

export function parsePushSubscription(value: unknown): PushSubscription | null {
	const item = object(value);
	const keys = object(item.keys);
	const endpoint = optionalString(item.endpoint);
	const p256dh = optionalString(keys.p256dh);
	const auth = optionalString(keys.auth);

	if (
		!endpoint ||
		!p256dh ||
		!auth ||
		!isAllowedPushEndpoint(endpoint) ||
		!isBase64Url(p256dh, 40, 200) ||
		!isBase64Url(auth, 16, 80)
	) {
		return null;
	}

	return { endpoint, keys: { p256dh, auth } };
}

export async function saveSubscription(
	kv: KVNamespace,
	subscription: PushSubscription,
	userAgent?: string,
): Promise<StoredSubscription> {
	const key = await subscriptionKey(subscription.endpoint);
	const existing = await kv.get<StoredSubscription>(key, "json");
	const record = mergeSubscriptionRecord(subscription, existing, userAgent);
	await kv.put(key, JSON.stringify(record));
	return record;
}

export function mergeSubscriptionRecord(
	subscription: PushSubscription,
	existing?: StoredSubscription | null,
	userAgent?: string,
): StoredSubscription {
	return {
		...subscription,
		createdAt: existing?.createdAt || new Date().toISOString(),
		userAgent: userAgent?.slice(0, MAX_USER_AGENT_LENGTH),
		excludedMatchIds: validStoredExcludedMatchIds(existing?.excludedMatchIds),
	};
}

export async function updateSubscriptionExclusions(
	kv: KVNamespace,
	endpoint: string,
	excludedMatchIds: string[],
): Promise<StoredSubscription | null> {
	const key = await subscriptionKey(endpoint);
	const existing = await kv.get<StoredSubscription>(key, "json");
	if (!existing || existing.endpoint !== endpoint) {
		return null;
	}

	const updated = { ...existing, excludedMatchIds };
	await kv.put(key, JSON.stringify(updated));
	return updated;
}

export async function deleteSubscription(
	kv: KVNamespace,
	endpoint: string,
): Promise<void> {
	await kv.delete(await subscriptionKey(endpoint));
}

export async function sendPushNotifications(
	env: Env,
	matches: MatchSummary[],
): Promise<DeliveryResult> {
	const subscriptions = await listSubscriptions(env.NOTIFIED_MATCHES);
	const result: DeliveryResult = { sent: 0, failed: 0, removed: 0 };
	const options = {
		TTL: 60 * 60,
		urgency: "high" as const,
		topic: "bwf-live",
		contentEncoding: "aes128gcm" as const,
		vapidDetails: {
			subject: env.VAPID_SUBJECT,
			publicKey: env.VAPID_PUBLIC_KEY,
			privateKey: env.VAPID_PRIVATE_KEY,
		},
	};

	for (const subscription of subscriptions) {
		const eligibleMatches = matchesForSubscription(subscription, matches);
		if (eligibleMatches.length === 0) {
			continue;
		}
		const payload = JSON.stringify(notificationPayload(eligibleMatches));
		try {
			await webpush.sendNotification(subscription, payload, options);
			result.sent += 1;
		} catch (error) {
			const status =
				error instanceof webpush.WebPushError ? error.statusCode : undefined;
			if (status === 404 || status === 410) {
				await deleteSubscription(env.NOTIFIED_MATCHES, subscription.endpoint);
				result.removed += 1;
				continue;
			}

			result.failed += 1;
			console.error(
				JSON.stringify({
					event: "push-delivery-error",
					status,
					error: error instanceof Error ? error.message : String(error),
				}),
			);
		}
	}

	return result;
}

export function parseExcludedMatchIds(value: unknown): string[] | null {
	if (!Array.isArray(value) || value.length > MAX_EXCLUDED_MATCH_IDS) {
		return null;
	}

	const ids = new Set<string>();
	for (const item of value) {
		if (
			typeof item !== "string" ||
			item.length < 1 ||
			item.length > 128 ||
			!/^[A-Za-z0-9._:-]+$/.test(item)
		) {
			return null;
		}
		ids.add(item);
	}
	return [...ids];
}

export function matchesForSubscription(
	subscription: StoredSubscription,
	matches: MatchSummary[],
): MatchSummary[] {
	const excluded = new Set(
		validStoredExcludedMatchIds(subscription.excludedMatchIds),
	);
	return matches.filter((match) => !excluded.has(match.id));
}

export function notificationPayload(matches: MatchSummary[]) {
	const lines = matches.slice(0, 3).map((match) => {
		const card = match.players.length
			? match.players.join(" vs ")
			: "対戦カード未定";
		return `${match.tournament}: ${card}`;
	});
	if (matches.length > lines.length) {
		lines.push(`ほか${matches.length - lines.length}試合`);
	}

	return {
		title:
			matches.length === 1
				? "日本人選手の試合が始まりました"
				: `日本人選手の試合が${matches.length}件始まりました`,
		body: lines.join("\n").slice(0, 2800),
		url: "/",
		tag: "bwf-live",
	};
}

async function listSubscriptions(
	kv: KVNamespace,
): Promise<StoredSubscription[]> {
	const subscriptions: StoredSubscription[] = [];
	let cursor: string | undefined;

	do {
		const page = await kv.list({ prefix: SUBSCRIPTION_PREFIX, cursor });
		for (const key of page.keys) {
			const value = await kv.get<StoredSubscription>(key.name, "json");
			if (value) {
				subscriptions.push(value);
			}
		}
		cursor = page.list_complete ? undefined : page.cursor;
	} while (cursor);

	return subscriptions;
}

async function subscriptionKey(endpoint: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(endpoint),
	);
	const hash = [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
	return `${SUBSCRIPTION_PREFIX}${hash}`;
}

export function isAllowedPushEndpoint(endpoint: string): boolean {
	try {
		const url = new URL(endpoint);
		if (url.protocol !== "https:" || endpoint.length > 2048) {
			return false;
		}

		const host = url.hostname.toLowerCase();
		return (
			host === "fcm.googleapis.com" ||
			host === "updates.push.services.mozilla.com" ||
			host.endsWith(".push.services.mozilla.com") ||
			host.endsWith(".push.apple.com") ||
			host.endsWith(".notify.windows.com")
		);
	} catch {
		return false;
	}
}

function validStoredExcludedMatchIds(value: unknown): string[] {
	return parseExcludedMatchIds(value) || [];
}

function isBase64Url(value: string, min: number, max: number): boolean {
	return (
		value.length >= min &&
		value.length <= max &&
		/^[A-Za-z0-9_-]+={0,2}$/.test(value)
	);
}
