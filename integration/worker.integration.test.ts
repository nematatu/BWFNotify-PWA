import {
	createExecutionContext,
	reset,
	waitOnExecutionContext,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, describe, expect, test } from "vitest";
import worker from "../src";
import { runNotificationCheck } from "../src/api/app";
import { resolveYoutubeStreamUrls } from "../src/api/youtube";
import type { MatchSummary } from "../src/type";

const liveMatch: MatchSummary = {
	id: "live-1",
	tournament: "Japan Open",
	youtubeUrl: "https://www.youtube.com/results?search_query=Japan+Open",
	players: ["日本選手", "Opponent"],
	teams: [],
	scores: [{ game: 1, team1: 10, team2: 8 }],
	eventType: "live",
};

afterEach(async () => {
	await reset();
});

describe("Worker integration", () => {
	test("uses one notification preference contract from registration through update", async () => {
		const endpoint = "https://fcm.googleapis.com/fcm/send/integration";
		const subscription = {
			endpoint,
			keys: { p256dh: "A".repeat(87), auth: "B".repeat(22) },
		};
		const registerContext = createExecutionContext();
		const registered = await worker.fetch(
			new Request("https://example.com/api/subscriptions", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ subscription }),
			}),
			env,
			registerContext,
		);
		await waitOnExecutionContext(registerContext);
		expect(registered.status).toBe(201);
		expect(await registered.json()).toEqual({
			ok: true,
			excludedMatchIds: [],
		});

		const updateContext = createExecutionContext();
		const updated = await worker.fetch(
			new Request("https://example.com/api/subscriptions", {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ endpoint, excludedMatchIds: ["match-1"] }),
			}),
			env,
			updateContext,
		);
		await waitOnExecutionContext(updateContext);
		expect(updated.status).toBe(200);
		expect(await updated.json()).toEqual({
			ok: true,
			excludedMatchIds: ["match-1"],
		});
	});

	test("keeps test delivery separate and rejects an unknown subscription", async () => {
		const context = createExecutionContext();
		const response = await worker.fetch(
			new Request("https://example.com/api/subscriptions/test", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					endpoint: "https://fcm.googleapis.com/fcm/send/missing",
				}),
			}),
			env,
			context,
		);
		await waitOnExecutionContext(context);
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({
			error: "Push subscription not found",
		});
	});

	test("serves status from edge cache without exposing internal retry state", async () => {
		await env.NOTIFIED_MATCHES.put(
			"push:state",
			JSON.stringify({
				checkedAt: "2026-07-18T00:00:00.000Z",
				matches: [liveMatch],
				notificationAttempts: { "live-1": 1 },
			}),
		);
		const url = `https://example.com/api/status?test=${crypto.randomUUID()}`;
		const firstContext = createExecutionContext();
		const first = await worker.fetch(new Request(url), env, firstContext);
		await waitOnExecutionContext(firstContext);
		expect(first.status).toBe(200);
		expect(first.headers.get("X-BWF-Cache")).toBe("MISS");
		expect(first.headers.get("Cache-Control")).toBe("public, max-age=30");
		expect(await first.json()).toEqual({
			checkedAt: "2026-07-18T00:00:00.000Z",
			matches: [liveMatch],
		});

		const secondContext = createExecutionContext();
		const second = await worker.fetch(
			new Request(`${url}&cache-bypass-attempt=1`),
			env,
			secondContext,
		);
		await waitOnExecutionContext(secondContext);
		expect(second.headers.get("X-BWF-Cache")).toBe("HIT");
	});

	test("serves the live endpoint from a canonical short-lived edge cache", async () => {
		const cacheKey = new Request("https://example.com/api/live");
		const body = {
			checkedAt: "2026-07-18T00:00:10.000Z",
			matches: [liveMatch],
		};
		await caches.default.put(
			cacheKey,
			new Response(JSON.stringify(body), {
				headers: {
					"Cache-Control": "public, max-age=10",
					"Content-Type": "application/json",
				},
			}),
		);
		const context = createExecutionContext();
		const response = await worker.fetch(
			new Request("https://example.com/api/live?cache-bypass-attempt=1"),
			env,
			context,
		);
		await waitOnExecutionContext(context);

		expect(response.headers.get("X-BWF-Cache")).toBe("HIT");
		expect(response.headers.get("Cache-Control")).toBe("public, max-age=10");
		expect(await response.json()).toEqual(body);
	});

	test("skips unchanged per-minute writes and keeps a bounded retry count", async () => {
		let now = new Date("2026-07-18T00:00:00.000Z");
		let notificationCalls = 0;
		let knownMatchCount = 0;
		const dependencies = {
			fetchMatches: async (
				_cache: KVNamespace,
				knownMatches: MatchSummary[],
			) => {
				knownMatchCount = knownMatches.length;
				return [liveMatch];
			},
			sendNotifications: async () => {
				notificationCalls += 1;
				return { sent: 0, failed: 1, removed: 0 };
			},
			now: () => now,
		};

		const first = await runNotificationCheck(env, dependencies);
		expect(first).toMatchObject({ newMatches: 1, stateWritten: true });
		expect(knownMatchCount).toBe(0);

		now = new Date("2026-07-18T00:01:00.000Z");
		const second = await runNotificationCheck(env, dependencies);
		expect(second).toMatchObject({ newMatches: 1, stateWritten: true });
		expect(knownMatchCount).toBe(1);

		now = new Date("2026-07-18T00:02:00.000Z");
		const third = await runNotificationCheck(env, dependencies);
		expect(third).toMatchObject({ newMatches: 1, stateWritten: true });

		now = new Date("2026-07-18T00:03:00.000Z");
		const fourth = await runNotificationCheck(env, dependencies);
		expect(fourth).toMatchObject({ newMatches: 0, stateWritten: false });
		expect(notificationCalls).toBe(3);
	});

	test("does not resend a live match after a transient upstream omission", async () => {
		let now = new Date("2026-07-18T00:00:00.000Z");
		let matches = [liveMatch];
		let notificationCalls = 0;
		const dependencies = {
			fetchMatches: async () => matches,
			sendNotifications: async () => {
				notificationCalls += 1;
				return { sent: 1, failed: 0, removed: 0 };
			},
			now: () => now,
		};

		await runNotificationCheck(env, dependencies);
		matches = [];
		now = new Date("2026-07-18T00:01:00.000Z");
		await runNotificationCheck(env, dependencies);
		matches = [liveMatch];
		now = new Date("2026-07-18T00:02:00.000Z");
		const restored = await runNotificationCheck(env, dependencies);

		expect(restored.newMatches).toBe(0);
		expect(notificationCalls).toBe(1);
	});

	test("notifies a new live match even when notifiedLiveMatches ledger already exists", async () => {
		const otherMatch = { ...liveMatch, id: "other-old-match" };
		let notificationCalls = 0;
		const dependencies = {
			fetchMatches: async () => [liveMatch],
			sendNotifications: async () => {
				notificationCalls += 1;
				return { sent: 1, failed: 0, removed: 0 };
			},
			now: () => new Date("2026-07-18T00:00:00.000Z"),
		};

		// Simulate state where notifiedLiveMatches already exists (migration done)
		// but does NOT contain liveMatch.id — it's a brand-new live match.
		await env.NOTIFIED_MATCHES.put(
			"push:state",
			JSON.stringify({
				checkedAt: "2026-07-17T23:58:00.000Z",
				matches: [],
				notifiedLiveMatches: {
					[otherMatch.id]: "2026-07-17T00:00:00.000Z",
				},
			}),
		);

		const result = await runNotificationCheck(env, dependencies);
		expect(result.newMatches).toBe(1);
		expect(notificationCalls).toBe(1);
	});

	test("caches a missing official stream without using KV", async () => {
		let youtubeRequests = 0;
		const match: MatchSummary = {
			...liveMatch,
			id: `missing-stream-${crypto.randomUUID()}`,
			youtubeUrl: "",
			tournament: "DAIHATSU Japan Open 2026",
			tournamentCategory: "HSBC BWF World Tour Super 750",
			tournamentDate: "2026-07-18",
			court: "Court 1",
			eventType: "scheduled",
		};
		const fetcher = async (input: RequestInfo | URL) => {
			youtubeRequests += 1;
			return String(input).includes("oembed")
				? Response.json({
						title: "DAIHATSU Japan Open 2026 - 17 July - Court 2",
						author_url: "https://www.youtube.com/@BWF",
					})
				: new Response('"videoId":"wrong123456"');
		};

		const first = await resolveYoutubeStreamUrls([match], fetcher);
		const afterFirst = youtubeRequests;
		const second = await resolveYoutubeStreamUrls([match], fetcher);

		expect(first[0]?.youtubeUrl).toBe("");
		expect(second[0]?.youtubeUrl).toBe("");
		expect(afterFirst).toBeGreaterThan(0);
		expect(youtubeRequests).toBe(afterFirst);
	});
});
