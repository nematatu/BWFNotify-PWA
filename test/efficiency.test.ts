import { describe, expect, test } from "bun:test";
import { STATE_MAX_AGE_MS, shouldPersistState } from "../src/api/app";
import type { MatchSummary, PublicState } from "../src/type";

const match = (score = 10): MatchSummary => ({
	id: "match-1",
	tournament: "Japan Open",
	youtubeUrl: "https://www.youtube.com/results?search_query=Japan+Open",
	players: ["日本選手", "Opponent"],
	teams: [],
	scores: [{ game: 1, team1: score, team2: 8 }],
	eventType: "live",
});

describe("KV state persistence", () => {
	const checkedAt = new Date("2026-07-18T00:00:00.000Z");
	const previous: PublicState = {
		checkedAt: checkedAt.toISOString(),
		matches: [match()],
		recentResults: [],
		calendarCheckedAt: null,
		calendarAttemptedAt: null,
		calendarError: null,
		upcomingTournaments: [],
	};

	test("does not rewrite unchanged state every minute", () => {
		expect(
			shouldPersistState(
				previous,
				{ ...previous, checkedAt: "2026-07-18T00:01:00.000Z" },
				new Date("2026-07-18T00:01:00.000Z"),
			),
		).toBe(false);
	});

	test("writes a heartbeat after the maximum age", () => {
		expect(
			shouldPersistState(
				previous,
				{ ...previous, checkedAt: "2026-07-18T00:05:00.000Z" },
				new Date(checkedAt.getTime() + STATE_MAX_AGE_MS),
			),
		).toBe(true);
	});

	test("writes immediately when a live score changes", () => {
		expect(
			shouldPersistState(
				previous,
				{
					checkedAt: "2026-07-18T00:01:00.000Z",
					matches: [match(11)],
				},
				new Date("2026-07-18T00:01:00.000Z"),
			),
		).toBe(true);
	});

	test("does not write when only upstream match ordering changes", () => {
		const second = { ...match(), id: "match-2" };
		const ordered = { ...previous, matches: [match(), second] };
		expect(
			shouldPersistState(
				ordered,
				{
					checkedAt: "2026-07-18T00:01:00.000Z",
					matches: [second, match()],
				},
				new Date("2026-07-18T00:01:00.000Z"),
			),
		).toBe(false);
	});

	test("runs cron at a resource-saving interval", async () => {
		const config = await Bun.file("wrangler.jsonc").json();
		expect(config.triggers.crons).toEqual(["*/2 * * * *"]);
	});

	test("limits unchanged KV heartbeat writes to 48 per day", () => {
		expect((24 * 60 * 60 * 1000) / STATE_MAX_AGE_MS).toBe(48);
	});
});

describe("YouTube discovery load", () => {
	test("keeps per-user live polling free of YouTube discovery", async () => {
		const source = await Bun.file("src/api/app.ts").text();
		expect(source).toContain("resolveYoutubeStreams: false");
	});
});
