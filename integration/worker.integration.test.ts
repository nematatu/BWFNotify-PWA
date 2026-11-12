import {
	createExecutionContext,
	reset,
	waitOnExecutionContext,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, describe, expect, test, vi } from "vitest";
import calendarSnapshot from "../config/upcoming-tournaments.json";
import worker from "../src";
import { parseTournamentPage } from "../src/api/baj";
import { runNotificationCheck } from "../src/api/notificationCheck";
import { staticTournamentCalendar } from "../src/api/tournamentCalendar";
import type { MatchSummary } from "../src/type";

const liveMatch: MatchSummary = {
	id: "live-1",
	tournament: "Japan Open",
	players: ["日本選手", "Opponent"],
	teams: [],
	scores: [{ game: 1, team1: 10, team2: 8 }],
	eventType: "live",
};

const noCalendar = {
	fetchHistory: async () => [],
};

afterEach(async () => {
	await reset();
});

describe("Worker integration", () => {
	test("serves the complete static 2026 BWF calendar", () => {
		const tournaments = staticTournamentCalendar();
		expect(tournaments.length).toBeGreaterThanOrEqual(42);
		expect(
			new Set(tournaments.map((tournament) => tournament.startDate.slice(0, 7)))
				.size,
		).toBe(12);
		expect(
			tournaments.some(
				(tournament) =>
					tournament.bwfUrl ===
					"https://corporate.bwfbadminton.com/events/calendar/2026/all/0/-1/",
			),
		).toBe(false);
		for (const tournament of tournaments) {
			if (tournament.bwfUrl) {
				expect(tournament.bwfUrl).toMatch(
					/^https:\/\/(?:bwfworldtour\.)?bwfbadminton\.com\/tournament\/\d+\//,
				);
			}
			if (tournament.bajUrl) {
				expect(tournament.bajUrl).toMatch(
					/^https:\/\/(?:www\.)?badminton\.or\.jp\/(?:storage|games)\//,
				);
			}
		}
		expect(
			tournaments.find((tournament) =>
				tournament.name.includes("ジャパンオープン2026"),
			),
		).toMatchObject({
			imageUrl: "/view/tournaments/daihatsu-japan-open-2026.jpg",
			bwfUrl:
				"https://bwfworldtour.bwfbadminton.com/tournament/5213/daihatsu-japan-open-2026/results/",
		});
	});

	test("parses a BAJ tournament card", async () => {
		const tournaments = await parseTournamentPage(
			new Response(`
				<ul><li class="v-tournament__item">
					<div class="v-tournament__date">2026.7.21 - 2026.7.26</div>
					<span class="c-tag">HSBC BWF World Tour Super 1000</span>
					<h3 class="v-tournament__ttl">中国オープン2026</h3>
					<p class="v-tournament__place">中国 常州市</p>
					<a class="v-tournament__links-link" href="https://bwfbadminton.com/tournament/1">大会サイト</a>
					<a class="v-tournament__links-link" href="/storage/send_out.pdf">派遣</a>
					<a class="v-tournament__links-link" href="/storage/contestant.pdf">参加者</a>
				</li></ul>
			`),
		);

		expect(tournaments).toEqual([
			{
				id: "2026-07-21:中国オープン2026",
				name: "中国オープン2026",
				category: "HSBC BWF World Tour Super 1000",
				startDate: "2026-07-21",
				endDate: "2026-07-26",
				bwfUrl: "https://bwfbadminton.com/tournament/1",
				bajUrl: "https://www.badminton.or.jp/storage/send_out.pdf",
			},
		]);
	});

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
		const subscriptionKeys = await env.NOTIFIED_MATCHES.list({
			prefix: "push:subscription:",
		});
		const metadata = subscriptionKeys.keys[0]?.metadata;
		expect(metadata).toMatchObject({ v: 2, e: endpoint });
		expect(
			new TextEncoder().encode(JSON.stringify(metadata)).byteLength,
		).toBeLessThanOrEqual(1024);

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

	test("disables notification writes in Worker Previews that share the production KV", async () => {
		const previewEnv = { ...env, APP_ENV: "preview" } as unknown as Env;
		const request = (path: string, init?: RequestInit) =>
			worker.fetch(
				new Request(`https://example.com${path}`, init),
				previewEnv,
				createExecutionContext(),
			);

		const config = await request("/api/config");
		expect(await config.json()).toEqual({
			targetCountry: "JPN",
			notificationsAvailable: false,
		});

		const routes = [
			["POST", "/api/subscriptions"],
			["PATCH", "/api/subscriptions"],
			["DELETE", "/api/subscriptions"],
			["POST", "/api/subscriptions/test"],
		] as const;
		for (const [method, path] of routes) {
			const response = await request(path, {
				method,
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					subscription: {
						endpoint: "https://fcm.googleapis.com/fcm/send/preview",
						keys: {
							p256dh: "B".repeat(87),
							auth: "A".repeat(22),
						},
					},
					endpoint: "https://fcm.googleapis.com/fcm/send/preview",
					excludedMatchIds: [],
				}),
			});
			expect(response.status).toBe(403);
		}
		// 購読データ（push:subscription:*）は1件も書き込まれていない
		const stored = await env.NOTIFIED_MATCHES.list({
			prefix: "push:subscription:",
		});
		expect(stored.keys).toHaveLength(0);
	});

	test("keeps notifications available in production", async () => {
		const context = createExecutionContext();
		const response = await worker.fetch(
			new Request("https://example.com/api/config"),
			env,
			context,
		);
		await waitOnExecutionContext(context);
		expect(await response.json()).toMatchObject({
			notificationsAvailable: true,
		});
	});

	test("rejects oversized bodies on every subscription route", async () => {
		const routes = [
			["POST", "/api/subscriptions"],
			["PATCH", "/api/subscriptions"],
			["DELETE", "/api/subscriptions"],
			["POST", "/api/subscriptions/test"],
		] as const;
		for (const [method, path] of routes) {
			const context = createExecutionContext();
			const response = await worker.fetch(
				new Request(`https://example.com${path}`, {
					method,
					headers: {
						"content-type": "application/json",
						"content-length": "4097",
					},
					body: "{}",
				}),
				env,
				context,
			);
			await waitOnExecutionContext(context);
			expect(response.status).toBe(413);
			expect(response.headers.get("cache-control")).toBe("no-store");
		}
	});

	test("rejects oversized bodies sent without content-length", async () => {
		const routes = [
			["POST", "/api/subscriptions"],
			["PATCH", "/api/subscriptions"],
			["DELETE", "/api/subscriptions"],
			["POST", "/api/subscriptions/test"],
		] as const;
		for (const [method, path] of routes) {
			const chunk = new TextEncoder().encode(" ".repeat(1024));
			let sent = 0;
			// 1KBずつ5回送り、合計で上限の4KBを超える分割送信。
			const body = new ReadableStream<Uint8Array>({
				pull(controller) {
					if (sent >= 5) {
						controller.close();
						return;
					}
					sent += 1;
					controller.enqueue(chunk);
				},
			});
			const request = new Request(`https://example.com${path}`, {
				method,
				headers: { "content-type": "application/json" },
				body,
			});
			expect(request.headers.get("content-length")).toBeNull();

			const context = createExecutionContext();
			const response = await worker.fetch(request, env, context);
			await waitOnExecutionContext(context);
			expect(response.status).toBe(413);
			expect(response.headers.get("cache-control")).toBe("no-store");
		}
	});

	test("still accepts a small body sent without content-length", async () => {
		const context = createExecutionContext();
		const response = await worker.fetch(
			new Request("https://example.com/api/subscriptions", {
				method: "DELETE",
				headers: { "content-type": "application/json" },
				body: new ReadableStream<Uint8Array>({
					start(controller) {
						controller.enqueue(
							new TextEncoder().encode(
								JSON.stringify({ endpoint: "https://fcm.googleapis.com/x" }),
							),
						);
						controller.close();
					},
				}),
			}),
			env,
			context,
		);
		await waitOnExecutionContext(context);
		expect(response.status).toBe(200);
	});

	test("returns 404 rather than 413 for an unknown subscription path", async () => {
		const context = createExecutionContext();
		const response = await worker.fetch(
			new Request("https://example.com/api/subscriptions/unknown", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"content-length": "4097",
				},
				body: "{}",
			}),
			env,
			context,
		);
		await waitOnExecutionContext(context);
		expect(response.status).toBe(404);
	});

	test("serves public status from edge cache without notification retry state", async () => {
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
			recentResults: [],
			calendarCheckedAt: null,
			upcomingTournaments: staticTournamentCalendar(),
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

	test("falls back to the saved live matches when BWF cannot be reached", async () => {
		await env.NOTIFIED_MATCHES.put(
			"push:state",
			JSON.stringify({
				checkedAt: "2026-07-18T00:00:00.000Z",
				matches: [
					liveMatch,
					{ ...liveMatch, id: "next-1", eventType: "scheduled" },
				],
			}),
		);
		// BWFが確認画面（403）を返す状況
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response("blocked", { status: 403 }));
		try {
			const context = createExecutionContext();
			const response = await worker.fetch(
				new Request("https://example.com/api/live"),
				env,
				context,
			);
			await waitOnExecutionContext(context);

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({
				checkedAt: "2026-07-18T00:00:00.000Z",
				source: "saved",
				matches: [liveMatch],
			});
		} finally {
			fetchSpy.mockRestore();
		}
	});

	test("skips unchanged per-minute writes and keeps a bounded retry count", async () => {
		let now = new Date("2026-07-18T00:00:00.000Z");
		let notificationCalls = 0;
		let knownMatchCount = 0;
		const dependencies = {
			...noCalendar,
			fetchMatches: async (
				_cache: KVNamespace,
				knownMatches: MatchSummary[],
			) => {
				knownMatchCount = knownMatches.length;
				return [liveMatch];
			},
			sendNotifications: async () => {
				notificationCalls += 1;
				return {
					sent: 0,
					failed: 1,
					removed: 0,
					byMatch: { [liveMatch.id]: { sent: 0, failed: 1, removed: 0 } },
				};
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

	test("keeps completed matches for seven days without storing the bundled calendar", async () => {
		const completed: MatchSummary = {
			...liveMatch,
			id: "completed-recent",
			eventType: "completed",
			tournamentDate: "2026-07-19",
		};
		const expired: MatchSummary = {
			...completed,
			id: "completed-expired",
			tournamentDate: "2026-07-10",
		};
		await runNotificationCheck(env, {
			fetchMatches: async () => [completed],
			fetchHistory: async () => [completed, expired],
			sendNotifications: async () => ({
				sent: 0,
				failed: 0,
				removed: 0,
				byMatch: {},
			}),
			now: () => new Date("2026-07-20T00:00:00.000Z"),
		});

		const stored = await env.NOTIFIED_MATCHES.get<{
			recentResults: MatchSummary[];
			calendarCheckedAt: string;
			upcomingTournaments: unknown[];
		}>("push:state", "json");
		expect(stored?.recentResults.map((match) => match.id)).toEqual([
			"completed-recent",
		]);
		expect(stored?.calendarCheckedAt).toBe(calendarSnapshot.generatedAt);
		// 大会カレンダーは /api/status が同梱設定から返すため、KVには保存しない。
		expect(stored).not.toHaveProperty("upcomingTournaments");
	});

	test("ignores a calendar stored by an older version without forcing a write", async () => {
		const legacyState = {
			checkedAt: "2026-07-18T00:00:00.000Z",
			matches: [liveMatch],
			recentResults: [],
			calendarCheckedAt: calendarSnapshot.generatedAt,
			upcomingTournaments: [{ id: "stale", name: "古い大会" }],
			historyCheckedAt: "2026-07-18T00:00:00.000Z",
			notificationAttempts: {},
			notifiedLiveMatches: { [liveMatch.id]: "2026-07-18T00:00:00.000Z" },
		};
		await env.NOTIFIED_MATCHES.put("push:state", JSON.stringify(legacyState));

		const result = await runNotificationCheck(env, {
			fetchMatches: async () => [liveMatch],
			fetchHistory: async () => [],
			sendNotifications: async () => {
				throw new Error("must not notify an already-notified match");
			},
			now: () => new Date("2026-07-18T00:02:00.000Z"),
		});
		expect(result).toMatchObject({ newMatches: 0, stateWritten: false });

		const context = createExecutionContext();
		const response = await worker.fetch(
			new Request("https://example.com/api/status?legacy=1"),
			env,
			context,
		);
		await waitOnExecutionContext(context);
		const body = await response.json<{ upcomingTournaments: unknown[] }>();
		expect(body.upcomingTournaments).toEqual(staticTournamentCalendar());
	});

	test("retries only the match whose deliveries all failed", async () => {
		const failedMatch = { ...liveMatch, id: "live-failed" };
		const sentMatch = { ...liveMatch, id: "live-sent" };
		const deliveries: string[][] = [];
		const dependencies = {
			...noCalendar,
			fetchMatches: async () => [failedMatch, sentMatch],
			sendNotifications: async (_env: Env, matches: MatchSummary[]) => {
				deliveries.push(matches.map((match) => match.id));
				if (deliveries.length === 1) {
					return {
						sent: 1,
						failed: 1,
						removed: 0,
						byMatch: {
							[failedMatch.id]: { sent: 0, failed: 1, removed: 0 },
							[sentMatch.id]: { sent: 1, failed: 0, removed: 0 },
						},
					};
				}
				return {
					sent: 1,
					failed: 0,
					removed: 0,
					byMatch: {
						[failedMatch.id]: { sent: 1, failed: 0, removed: 0 },
					},
				};
			},
			now: () => new Date("2026-07-18T00:00:00.000Z"),
		};

		await runNotificationCheck(env, dependencies);
		await runNotificationCheck(env, dependencies);

		expect(deliveries).toEqual([
			[failedMatch.id, sentMatch.id],
			[failedMatch.id],
		]);
	});

	test("does not resend a live match after a transient upstream omission", async () => {
		let now = new Date("2026-07-18T00:00:00.000Z");
		let matches = [liveMatch];
		let notificationCalls = 0;
		const dependencies = {
			...noCalendar,
			fetchMatches: async () => matches,
			sendNotifications: async () => {
				notificationCalls += 1;
				return {
					sent: 1,
					failed: 0,
					removed: 0,
					byMatch: { [liveMatch.id]: { sent: 1, failed: 0, removed: 0 } },
				};
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
			...noCalendar,
			fetchMatches: async () => [liveMatch],
			sendNotifications: async () => {
				notificationCalls += 1;
				return {
					sent: 1,
					failed: 0,
					removed: 0,
					byMatch: { [liveMatch.id]: { sent: 1, failed: 0, removed: 0 } },
				};
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
});
