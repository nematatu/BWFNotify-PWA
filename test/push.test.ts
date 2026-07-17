import { describe, expect, test } from "bun:test";
import webpush from "web-push";
import {
	getSavedSubscription,
	notificationPayload,
	parsePushSubscription,
} from "../src/push";

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
	test("builds a compact aggregate notification", () => {
		const payload = notificationPayload([
			{
				id: "1",
				tournament: "Japan Open",
				players: ["Player A", "Player B"],
				status: "Live",
			},
		]);

		expect(payload.title).toBe("日本人選手の試合が始まりました");
		expect(payload.body).toBe("Japan Open: Player A vs Player B");
		expect(payload.url).toBe("/");
	});
});

describe("getSavedSubscription", () => {
	test("accepts only an exact saved subscription", async () => {
		const saved = {
			endpoint: "https://fcm.googleapis.com/fcm/send/example",
			keys: validKeys,
			createdAt: "2026-07-18T00:00:00.000Z",
		};
		const kv = {
			get: async () => saved,
		} as unknown as KVNamespace;

		expect(await getSavedSubscription(kv, saved)).toEqual(saved);
		expect(
			await getSavedSubscription(kv, {
				...saved,
				keys: { ...validKeys, auth: "C".repeat(22) },
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
