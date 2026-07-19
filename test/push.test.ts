import { describe, expect, test } from "bun:test";
import webpush from "web-push";
import {
	matchesForSubscription,
	mergeSubscriptionRecord,
	notificationPayload,
	parseExcludedMatchIds,
	parsePushSubscription,
	subscriptionMetadata,
	testNotificationPayload,
} from "../src/api/push";
import type { MatchSummary, StoredSubscription } from "../src/type";

const validKeys = {
	p256dh: "A".repeat(87),
	auth: "B".repeat(22),
};

describe("parsePushSubscription", () => {
	test("accepts known browser push services", () => {
		expect(
			parsePushSubscription({
				endpoint: "https://fcm.googleapis.com/fcm/send/example",
				keys: validKeys,
			}),
		).toEqual({
			endpoint: "https://fcm.googleapis.com/fcm/send/example",
			keys: validKeys,
		});
	});

	test("rejects arbitrary endpoints", () => {
		expect(
			parsePushSubscription({
				endpoint: "https://example.com/webhook",
				keys: validKeys,
			}),
		).toBeNull();
	});
});

describe("notificationPayload", () => {
	test("builds a test notification with an existing app icon", async () => {
		expect(testNotificationPayload(123)).toEqual({
			title: "テスト通知",
			body: "BWFNotifyから通知を受信できました",
			url: "/",
			icon: "/pwa/icons/icon-192.png",
			tag: "bwf-test:123",
		});
		expect(await Bun.file("public/pwa/icons/icon-192.png").exists()).toBe(true);
	});

	test("builds a match-specific notification", () => {
		const payload = notificationPayload({
			id: "1",
			tournament: "Japan Open",
			players: ["Player A", "Player B"],
			teams: [],
			scores: [],
			youtubeUrl: "https://www.youtube.com/watch?v=abcdefghijk",
			eventType: "live",
		});

		expect(payload.title).toBe("Player A vs Player B が始まりました");
		expect(payload.body).toBe("Japan Open");
		expect(payload.url).toBe("https://www.youtube.com/watch?v=abcdefghijk");
		expect(payload.tag).toBe("bwf-live:1");
	});

	test("uses the Japanese player photo as the notification image and icon", () => {
		const payload = notificationPayload({
			id: "photo",
			tournament: "Japan Open",
			players: ["山口茜", "Player B"],
			teams: [
				{
					players: [
						{
							name: "山口茜",
							isJapanese: true,
							photoUrl: "https://img.bwfbadminton.com/image/upload/player.jpg",
						},
					],
				},
			],
			scores: [],
			youtubeUrl: "https://www.youtube.com/watch?v=photo000001",
			eventType: "live",
		});
		expect(payload.image).toContain("img.bwfbadminton.com");
		expect(payload.icon).toBe(payload.image);
	});

	test("keeps each match YouTube destination independent", () => {
		const base: MatchSummary = {
			id: "one",
			tournament: "Japan Open",
			players: ["Player A", "Player B"],
			teams: [],
			scores: [],
			youtubeUrl: "https://www.youtube.com/watch?v=matchone001",
			eventType: "live",
		};
		const first = notificationPayload(base);
		const second = notificationPayload({
			...base,
			id: "two",
			youtubeUrl: "https://www.youtube.com/watch?v=matchtwo002",
		});

		expect(first.url).not.toBe(second.url);
		expect(first.tag).not.toBe(second.tag);
	});
});

describe("notification exclusions", () => {
	const matches: MatchSummary[] = [
		{
			id: "included",
			tournament: "Japan Open",
			players: ["Player A", "Player B"],
			teams: [],
			scores: [],
			youtubeUrl: "https://www.youtube.com/watch?v=included001",
			eventType: "live",
		},
		{
			id: "excluded",
			tournament: "Japan Open",
			players: ["Player C", "Player D"],
			teams: [],
			scores: [],
			youtubeUrl: "https://www.youtube.com/watch?v=excluded001",
			eventType: "live",
		},
	];
	const subscription: StoredSubscription = {
		endpoint: "https://fcm.googleapis.com/fcm/send/example",
		keys: validKeys,
		createdAt: "2026-07-18T00:00:00.000Z",
		excludedMatchIds: ["excluded"],
	};

	test("accepts and deduplicates valid match IDs", () => {
		expect(parseExcludedMatchIds(["one", "one", "two:3"])).toEqual([
			"one",
			"two:3",
		]);
		expect(parseExcludedMatchIds(["invalid id"])).toBeNull();
	});

	test("notifies every match by default", () => {
		expect(
			matchesForSubscription(
				{ ...subscription, excludedMatchIds: [] },
				matches,
			),
		).toEqual(matches);
	});

	test("removes excluded matches for each subscription", () => {
		expect(matchesForSubscription(subscription, matches)).toEqual([matches[0]]);
	});

	test("preserves exclusions when the browser subscription is saved again", () => {
		const saved = mergeSubscriptionRecord(
			{ endpoint: subscription.endpoint, keys: validKeys },
			subscription,
			"test browser",
		);
		expect(saved.excludedMatchIds).toEqual(["excluded"]);
		expect(saved.createdAt).toBe(subscription.createdAt);
		expect(saved.userAgent).toBe("test browser");
	});

	test("keeps normal subscription metadata within the KV byte limit", () => {
		const metadata = subscriptionMetadata(subscription);
		expect(metadata).not.toBeNull();
		expect(
			new TextEncoder().encode(JSON.stringify(metadata)).byteLength,
		).toBeLessThanOrEqual(1024);
	});

	test("falls back to the KV value when compact metadata exceeds the limit", () => {
		expect(
			subscriptionMetadata({
				...subscription,
				excludedMatchIds: Array.from(
					{ length: 50 },
					(_, index) => `${index}-${"x".repeat(120)}`,
				),
			}),
		).toBeNull();
	});
});

describe("Web Push encryption", () => {
	test("builds an encrypted request with Web Crypto keys", async () => {
		const vapidKeys = webpush.generateVAPIDKeys();
		const subscriberKeys = await crypto.subtle.generateKey(
			{ name: "ECDH", namedCurve: "P-256" },
			true,
			["deriveBits"],
		);
		const subscriberPublicKey = await crypto.subtle.exportKey(
			"raw",
			subscriberKeys.publicKey,
		);
		const auth = new Uint8Array(16);
		crypto.getRandomValues(auth);

		const request = webpush.generateRequestDetails(
			{
				endpoint: "https://fcm.googleapis.com/fcm/send/test",
				keys: {
					p256dh: base64Url(new Uint8Array(subscriberPublicKey)),
					auth: base64Url(auth),
				},
			},
			JSON.stringify({ title: "test" }),
			{
				contentEncoding: "aes128gcm",
				vapidDetails: {
					subject: "mailto:test@example.com",
					publicKey: vapidKeys.publicKey,
					privateKey: vapidKeys.privateKey,
				},
			},
		);

		expect(request.endpoint).toBe("https://fcm.googleapis.com/fcm/send/test");
		expect(request.body.byteLength).toBeGreaterThan(0);
		expect(new Headers(request.headers).get("content-encoding")).toBe(
			"aes128gcm",
		);
	});
});

function base64Url(bytes: Uint8Array): string {
	return Buffer.from(bytes)
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}
