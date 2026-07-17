import webpush, { type PushSubscription } from "web-push";
import type { DeliveryResult, LiveMatch, StoredSubscription } from "./types";
import { object, optionalString } from "./utils";

const SUBSCRIPTION_PREFIX = "push:subscription:";
const MAX_USER_AGENT_LENGTH = 240;

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
): Promise<void> {
	const record: StoredSubscription = {
		...subscription,
		createdAt: new Date().toISOString(),
		userAgent: userAgent?.slice(0, MAX_USER_AGENT_LENGTH),
	};
	await kv.put(
		await subscriptionKey(subscription.endpoint),
		JSON.stringify(record),
	);
}

export async function deleteSubscription(
	kv: KVNamespace,
	endpoint: string,
): Promise<void> {
	await kv.delete(await subscriptionKey(endpoint));
}

export async function getSavedSubscription(
	kv: KVNamespace,
	subscription: PushSubscription,
): Promise<StoredSubscription | null> {
	const saved = await kv.get<StoredSubscription>(
		await subscriptionKey(subscription.endpoint),
		"json",
	);
	if (
		!saved ||
		saved.endpoint !== subscription.endpoint ||
		saved.keys.p256dh !== subscription.keys.p256dh ||
		saved.keys.auth !== subscription.keys.auth
	) {
		return null;
	}
	return saved;
}

export async function sendPushNotifications(
	env: Env,
	matches: LiveMatch[],
): Promise<DeliveryResult> {
	const subscriptions = await listSubscriptions(env.NOTIFIED_MATCHES);
	const payload = JSON.stringify(notificationPayload(matches));
	return deliverNotifications(env, subscriptions, payload, "bwf-live");
}

export async function sendTestPushNotification(
	env: Env,
	subscription: PushSubscription,
): Promise<DeliveryResult> {
	const payload = JSON.stringify({
		title: "BWF 通知テスト",
		body: "通知は正常に設定されています",
		url: "/",
		tag: "bwf-test",
	});
	return deliverNotifications(env, [subscription], payload, "bwf-test");
}

async function deliverNotifications(
	env: Env,
	subscriptions: PushSubscription[],
	payload: string,
	topic: string,
): Promise<DeliveryResult> {
	const result: DeliveryResult = { sent: 0, failed: 0, removed: 0 };
	const options = {
		TTL: 60 * 60,
		urgency: "high" as const,
		topic,
		contentEncoding: "aes128gcm" as const,
		vapidDetails: {
			subject: env.VAPID_SUBJECT,
			publicKey: env.VAPID_PUBLIC_KEY,
			privateKey: env.VAPID_PRIVATE_KEY,
		},
	};

	for (const subscription of subscriptions) {
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

export function notificationPayload(matches: LiveMatch[]) {
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

function isAllowedPushEndpoint(endpoint: string): boolean {
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

function isBase64Url(value: string, min: number, max: number): boolean {
	return (
		value.length >= min &&
		value.length <= max &&
		/^[A-Za-z0-9_-]+={0,2}$/.test(value)
	);
}
