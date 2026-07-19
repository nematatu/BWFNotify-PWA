import webpush, { type PushSubscription } from "web-push";
import type {
	DeliveryCounts,
	DeliveryResult,
	MatchSummary,
	StoredSubscription,
} from "../type";
import { object, optionalString } from "../utils";

const SUBSCRIPTION_PREFIX = "push:subscription:";
const MAX_USER_AGENT_LENGTH = 240;
const MAX_EXCLUDED_MATCH_IDS = 50;
const MAX_KV_METADATA_BYTES = 1024;

type SubscriptionMetadata = {
	v: 2;
	e: string;
	p: string;
	a: string;
	x?: string[];
};

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
	const recordJson = JSON.stringify(record);

	if (existing && JSON.stringify(existing) === recordJson) {
		return record;
	}

	await putSubscriptionRecord(kv, key, recordJson, record);
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

	const sortedExisting = [...(existing.excludedMatchIds || [])].sort();
	const sortedUpdated = [...excludedMatchIds].sort();
	if (JSON.stringify(sortedExisting) === JSON.stringify(sortedUpdated)) {
		return existing;
	}

	const updated = { ...existing, excludedMatchIds };
	const recordJson = JSON.stringify(updated);
	await putSubscriptionRecord(kv, key, recordJson, updated);
	return updated;
}

export function subscriptionMetadata(
	record: StoredSubscription,
): SubscriptionMetadata | null {
	const metadata: SubscriptionMetadata = {
		v: 2,
		e: record.endpoint,
		p: record.keys.p256dh,
		a: record.keys.auth,
		...(record.excludedMatchIds?.length ? { x: record.excludedMatchIds } : {}),
	};
	return new TextEncoder().encode(JSON.stringify(metadata)).byteLength <=
		MAX_KV_METADATA_BYTES
		? metadata
		: null;
}

async function putSubscriptionRecord(
	kv: KVNamespace,
	key: string,
	value: string,
	record: StoredSubscription,
): Promise<void> {
	const metadata = subscriptionMetadata(record);
	await kv.put(key, value, metadata ? { metadata } : undefined);
}

export async function deleteSubscription(
	kv: KVNamespace,
	endpoint: string,
): Promise<void> {
	await kv.delete(await subscriptionKey(endpoint));
}

export async function sendTestNotification(
	env: Env,
	endpoint: string,
): Promise<"sent" | "missing" | "removed"> {
	const subscription = await env.NOTIFIED_MATCHES.get<StoredSubscription>(
		await subscriptionKey(endpoint),
		"json",
	);
	if (!subscription || subscription.endpoint !== endpoint) return "missing";

	try {
		await webpush.sendNotification(
			subscription,
			JSON.stringify(testNotificationPayload()),
			pushOptions(env, "bwf-test"),
		);
		return "sent";
	} catch (error) {
		const status =
			error instanceof webpush.WebPushError ? error.statusCode : undefined;
		if (status === 404 || status === 410) {
			await deleteSubscription(env.NOTIFIED_MATCHES, endpoint);
			return "removed";
		}
		throw error;
	}
}

export function testNotificationPayload(now = Date.now()) {
	return {
		title: "テスト通知",
		body: "BWFNotifyから通知を受信できました",
		url: "/",
		icon: "/pwa/icons/icon-192.png",
		tag: `bwf-test:${now}`,
	};
}

export async function sendPushNotifications(
	env: Env,
	matches: MatchSummary[],
): Promise<DeliveryResult> {
	const subscriptions = await listSubscriptions(env.NOTIFIED_MATCHES);
	const result: DeliveryResult = {
		sent: 0,
		failed: 0,
		removed: 0,
		byMatch: Object.fromEntries(
			matches.map((match) => [match.id, emptyDeliveryCounts()]),
		),
	};
	const options = pushOptions(env, "bwf-live");

	for (const subscription of subscriptions) {
		const eligibleMatches = matchesForSubscription(subscription, matches);
		for (const match of eligibleMatches) {
			const matchResult = result.byMatch[match.id];
			try {
				await webpush.sendNotification(
					subscription,
					JSON.stringify(notificationPayload(match)),
					{ ...options, topic: notificationTopic(match) },
				);
				result.sent += 1;
				matchResult.sent += 1;
			} catch (error) {
				const status =
					error instanceof webpush.WebPushError ? error.statusCode : undefined;
				if (status === 404 || status === 410) {
					await deleteSubscription(env.NOTIFIED_MATCHES, subscription.endpoint);
					result.removed += 1;
					matchResult.removed += 1;
					break;
				}

				result.failed += 1;
				matchResult.failed += 1;
				console.error(
					JSON.stringify({
						event: "push-delivery-error",
						matchId: match.id,
						status,
						error: error instanceof Error ? error.message : String(error),
					}),
				);
			}
		}
	}

	return result;
}

function emptyDeliveryCounts(): DeliveryCounts {
	return { sent: 0, failed: 0, removed: 0 };
}

function pushOptions(env: Env, topic: string) {
	return {
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

export function notificationPayload(match: MatchSummary) {
	const card = match.players.length
		? match.players.join(" vs ")
		: "対戦カード未定";
	const details = [match.tournament, match.court].filter(Boolean).join(" / ");
	const img = notificationImage(match);
	return {
		title: `${card} が始まりました`,
		body: details || "日本人選手の試合が始まりました",
		url: match.youtubeUrl || "/",
		icon: img,
		image: img,
		tag: `bwf-live:${match.id}`,
	};
}

function notificationImage(match: MatchSummary) {
	return match.teams
		.find((team) => team.players.some((player) => player.isJapanese))
		?.players.find((player) => player.isJapanese)?.photoUrl;
}

function notificationTopic(match: MatchSummary): string {
	return `bwf-${match.id}`.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 32);
}

async function listSubscriptions(
	kv: KVNamespace,
): Promise<StoredSubscription[]> {
	const subscriptions: StoredSubscription[] = [];
	let cursor: string | undefined;

	do {
		const page = await kv.list<
			SubscriptionMetadata | Omit<StoredSubscription, "userAgent">
		>({
			prefix: SUBSCRIPTION_PREFIX,
			cursor,
		});
		for (const key of page.keys) {
			const fromMetadata = subscriptionFromMetadata(key.metadata);
			if (fromMetadata) {
				subscriptions.push(fromMetadata);
			} else {
				const value = await kv.get<StoredSubscription>(key.name, "json");
				if (value) {
					subscriptions.push(value);
				}
			}
		}
		cursor = page.list_complete ? undefined : page.cursor;
	} while (cursor);

	return subscriptions;
}

function subscriptionFromMetadata(
	metadata:
		| SubscriptionMetadata
		| Omit<StoredSubscription, "userAgent">
		| undefined,
): StoredSubscription | null {
	if (!metadata) return null;
	if ("v" in metadata && metadata.v === 2) {
		return {
			endpoint: metadata.e,
			keys: { p256dh: metadata.p, auth: metadata.a },
			createdAt: "",
			excludedMatchIds: validStoredExcludedMatchIds(metadata.x),
		};
	}
	const legacy = metadata as Omit<StoredSubscription, "userAgent">;
	return {
		...legacy,
		userAgent: undefined,
	};
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
