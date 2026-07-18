import { describe, expect, test } from "bun:test";
import {
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
});
