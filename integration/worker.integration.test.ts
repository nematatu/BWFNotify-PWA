import {
	createExecutionContext,
	reset,
	waitOnExecutionContext,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, describe, expect, test } from "vitest";
import worker from "../src";
import { runNotificationCheck } from "../src/api/app";
import type { MatchSummary } from "../src/type";

const liveMatch: MatchSummary = {
	id: "live-1",
	tournament: "Japan Open",
	youtubeUrl: "https://www.youtube.com/results?search_query=Japan+Open",
	players: ["日本選手", "Opponent"],
	teams: [],
	scores: [{ game: 1, team1: 10, team2: 8 }],
	eventType: "live",
	status: "Live",
};

afterEach(async () => {
	await reset();
});

describe("Worker integration", () => {
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
});
