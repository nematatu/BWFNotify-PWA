import { describe, expect, test } from "bun:test";
import {
	mergeLiveMatches,
	sortedMatches,
	tournamentGroups,
} from "../public/view/match-groups.js";

describe("match sorting", () => {
	const matches = [
		{
			id: "a-late",
			tournament: "Tournament A",
			startTime: "2026-07-18 05:00:00",
		},
		{
			id: "b-first",
			tournament: "Tournament B",
			startTime: "2026-07-18 01:00:00",
		},
		{
			id: "a-early",
			tournament: "Tournament A",
			startTime: "2026-07-18 03:00:00",
		},
	];

	test("sorts every match across tournaments by time", () => {
		expect(sortedMatches(matches).map((match) => match.id)).toEqual([
			"b-first",
			"a-early",
			"a-late",
		]);
		expect(
			sortedMatches(matches, "time-desc").map((match) => match.id),
		).toEqual(["a-late", "a-early", "b-first"]);
	});

	test("groups only the tournament view and sorts matches inside it", () => {
		const groups = tournamentGroups([
			{
				id: "a-late",
				tournament: "Tournament A",
				startTime: "2026-07-18 05:00:00",
			},
			{
				id: "b-first",
				tournament: "Tournament B",
				startTime: "2026-07-18 01:00:00",
			},
			{
				id: "a-early",
				tournament: "Tournament A",
				startTime: "2026-07-18 03:00:00",
			},
		]);

		expect(groups.map((group) => group.name)).toEqual([
			"Tournament A",
			"Tournament B",
		]);
		expect(groups[0].matches.map((match) => match.id)).toEqual([
			"a-early",
			"a-late",
		]);
	});
});

describe("live score updates", () => {
	test("merges fresh scores while preserving H2H and scheduled matches", () => {
		const current = [
			{
				id: "live",
				eventType: "live",
				scores: [{ game: 1, team1: 10, team2: 8 }],
				h2h: { team1Wins: 2, team2Wins: 1 },
			},
			{ id: "scheduled", eventType: "scheduled", scores: [] },
		];
		const merged = mergeLiveMatches(current, [
			{
				id: "live",
				eventType: "live",
				scores: [{ game: 1, team1: 11, team2: 8 }],
			},
		]);

		expect(merged.map((match) => match.id)).toEqual(["live", "scheduled"]);
		expect(merged[0].scores[0].team1).toBe(11);
		expect(merged[0].h2h).toEqual({ team1Wins: 2, team2Wins: 1 });
	});

	test("removes a live match when it is no longer returned", () => {
		expect(mergeLiveMatches([{ id: "live", eventType: "live" }], [])).toEqual(
			[],
		);
	});

	test("polls live scores only while the page is active", async () => {
		const script = await Bun.file("public/view/app.js").text();
		expect(script).toContain('api("/api/live", { cache: "no-store" })');
		expect(script).toContain("LIVE_REFRESH_INTERVAL_MS = 15_000");
		expect(script).toContain('document.visibilityState !== "visible"');
		expect(script).toContain("stopAutomaticUpdates()");
		expect(script).toContain('currentMatchView = "live"');
		expect(script).toContain("lastUpdated.dataset.checkedAt");
	});
});

describe("page structure", () => {
	test("includes complete OGP metadata", async () => {
		const html = await Bun.file("public/index.html").text();
		for (const property of [
			'property="og:title"',
			'property="og:description"',
			'property="og:url"',
			'property="og:image"',
			'name="twitter:card"',
		]) {
			expect(html).toContain(property);
		}
	});

	test("separates live and scheduled matches in one tab panel", async () => {
		const html = await Bun.file("public/index.html").text();
		expect(html).toContain('data-match-view="live"');
		expect(html).toContain('data-match-view="scheduled"');
		expect(html).toContain('id="match-list"');
		expect(html).not.toContain('id="live-match-list"');
		expect(html).not.toContain('id="scheduled-match-list"');
	});

	test("explains installation and notification permission before prompting", async () => {
		const html = await Bun.file("public/index.html").text();
		expect(html).toContain("通知を使うまで 3ステップ");
		expect(html).toContain('id="install-action"');
		expect(html).toContain('id="permission-overlay"');
		expect(html).toContain("通知する");
		expect(html).toContain("通知しない");
		const script = await Bun.file("public/view/app.js").text();
		expect(script).toContain('window.addEventListener("beforeinstallprompt"');
		expect(script).toContain("SafariまたはChromeで開く");
		expect(script.indexOf("Notification.requestPermission()")).toBeLessThan(
			script.indexOf(
				"registration.pushManager.getSubscription()",
				script.indexOf("async function updateNotificationSubscription"),
			),
		);
	});

	test("uses YouTube links and removes the previous BWF match link", async () => {
		const script = await Bun.file("public/view/app.js").text();
		expect(script).toContain("youtubeLink(match.youtubeUrl)");
		expect(script).not.toContain("match.matchUrl");
		expect(script).not.toContain("BWFの試合掲載ページ");
	});

	test("uses BWF tournament media in each time-sorted match", async () => {
		const script = await Bun.file("public/view/app.js").text();
		expect(script).toContain("match.tournamentHeaderImageUrl");
		expect(script).toContain('"match-tournament-image"');
		const css = await Bun.file("public/view/app.css").text();
		expect(css).toContain(".match-tournament-image");
		expect(css).not.toContain("linear-gradient");
	});
});
