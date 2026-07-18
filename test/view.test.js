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
				youtubeUrl: "https://www.youtube.com/watch?v=abcdefghijk",
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
		expect(merged[0].youtubeUrl).toBe(
			"https://www.youtube.com/watch?v=abcdefghijk",
		);
		expect(merged[0].scoreChangedTeam).toBe(1);
	});

	test("removes a live match when it is no longer returned", () => {
		expect(mergeLiveMatches([{ id: "live", eventType: "live" }], [])).toEqual(
			[],
		);
	});

	test("uses the last rally winner when multiple points changed", () => {
		const [merged] = mergeLiveMatches(
			[
				{
					id: "live",
					eventType: "live",
					scores: [{ game: 1, team1: 10, team2: 8 }],
				},
			],
			[
				{
					id: "live",
					eventType: "live",
					scores: [{ game: 1, team1: 12, team2: 10, lastPointWinner: 2 }],
				},
			],
		);
		expect(merged.scoreChangedTeam).toBe(2);
	});

	test("does not repeat the score animation when the score is unchanged", () => {
		const match = {
			id: "live",
			eventType: "live",
			scores: [{ game: 1, team1: 12, team2: 10, lastPointWinner: 2 }],
		};
		const [merged] = mergeLiveMatches([match], [match]);
		expect(merged.scoreChangedTeam).toBeUndefined();
	});

	test("does not preserve an obsolete YouTube search URL", () => {
		const [merged] = mergeLiveMatches(
			[
				{
					id: "live",
					eventType: "live",
					youtubeUrl: "https://www.youtube.com/results?search_query=match",
				},
			],
			[{ id: "live", eventType: "live", youtubeUrl: "" }],
		);
		expect(merged.youtubeUrl).toBe("");
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
	test("uses square cards without decorative partial color borders", async () => {
		const css = await Bun.file("public/view/app.css").text();
		expect(css).toContain(
			".match {\n\tmargin-bottom: 18px;\n\tborder: 1px solid #444444;\n\tborder-radius: 0;",
		);
		expect(css).not.toContain(".live-match {");
		expect(css).not.toContain("border-top: 4px solid #d71920");
		expect(css).not.toContain("border-bottom: 3px solid #d71920");
	});

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
		expect(html).toContain('content="summary_large_image"');
		expect(html).toContain("/pwa/og-image.png");
		expect(html).toContain('property="og:image:width" content="1200"');
		expect(html).toContain('property="og:image:height" content="630"');
		const image = new Uint8Array(
			await Bun.file("public/pwa/og-image.png").arrayBuffer(),
		);
		const view = new DataView(image.buffer, image.byteOffset, image.byteLength);
		expect(view.getUint32(16)).toBe(1200);
		expect(view.getUint32(20)).toBe(630);
	});

	test("uses the Japanese player photo for notification image and icon", async () => {
		const app = await Bun.file("public/view/app.js").text();
		const worker = await Bun.file("public/pwa/sw.js").text();
		expect(app).toContain(
			"const notificationImage = proxiedImageUrl(imageUrl)",
		);
		expect(app).toContain(
			'icon: notificationImage || "/pwa/icons/icon-192.png"',
		);
		expect(worker).toContain("notificationMediaUrl(payload.image)");
		expect(worker).toContain('new URL("/api/media", self.location.origin)');
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
		expect(script).toContain('link.append("配信を見る")');
		expect(script).not.toContain("YouTube検索");
		expect(script).not.toContain("match.matchUrl");
		expect(script).not.toContain("BWFの試合掲載ページ");
	});

	test("uses clear Japanese labels instead of decorative English", async () => {
		const html = await Bun.file("public/index.html").text();
		const script = await Bun.file("public/view/app.js").text();
		expect(html).toContain("<h1>ライブスコア</h1>");
		expect(html).toContain("<p>日本人選手</p>");
		expect(script).toContain('live.textContent = "ライブ中"');
		expect(script).toContain('shuttle.alt = "サーブ"');
		expect(script).not.toContain('serve.textContent = "サーブ"');
		expect(script).toContain('label.textContent = "対戦成績"');
		expect(script).toContain("function displayCourt(value)");
		expect(script).toContain("Number(number)");
		expect(script).not.toContain('live.textContent = "LIVE"');
		expect(script).not.toContain('label.textContent = "HEAD TO HEAD"');
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
