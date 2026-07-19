import { describe, expect, test } from "bun:test";
import { pollingMode } from "../src/frontend/lib/pollingPolicy.ts";
import {
	displayCourt,
	displayRound,
	displayTournamentCategory,
	formatMatchTime,
	mergeLiveMatches,
	notificationToggleAction,
	playerInitial,
	previousGameScoreline,
	proxiedImageUrl,
	safeHttpsUrl,
	sortedMatches,
	teamLabel,
	tournamentGroups,
} from "../src/frontend/lib/utils.ts";
import { preferredInitialView } from "../src/frontend/lib/viewPolicy.ts";

describe("notification toggle policy", () => {
	test("allows notifications from supported non-iOS browsers without installation", () => {
		expect(notificationToggleAction("default", false, false)).toBe("toggle");
	});

	test("guides non-installed iOS users to the home screen version", () => {
		expect(notificationToggleAction("default", true, false)).toBe("install");
		expect(notificationToggleAction("default", true, true)).toBe("toggle");
	});

	test("keeps a denied permission actionable so settings guidance can open", () => {
		expect(notificationToggleAction("denied", false, false)).toBe("blocked");
	});
});

describe("polling policy", () => {
	test("starts live polling as soon as a live match exists", () => {
		expect(
			pollingMode({ visible: true, idle: false, hasLiveMatches: true }),
		).toBe("live");
	});

	test("uses normal polling without a live match", () => {
		expect(
			pollingMode({ visible: true, idle: false, hasLiveMatches: false }),
		).toBe("active");
	});

	test("pauses polling while hidden or idle", () => {
		expect(
			pollingMode({ visible: false, idle: false, hasLiveMatches: true }),
		).toBe("paused");
		expect(
			pollingMode({ visible: true, idle: true, hasLiveMatches: true }),
		).toBe("paused");
	});
});

describe("initial view policy", () => {
	test("opens results when there are no current matches", () => {
		expect(preferredInitialView([], 142, 8)).toBe("results");
	});

	test("prioritizes current matches over historical data", () => {
		expect(preferredInitialView([{ eventType: "scheduled" }], 142, 8)).toBe(
			"scheduled",
		);
		expect(preferredInitialView([{ eventType: "live" }], 142, 8)).toBe("live");
	});

	test("opens upcoming tournaments when no results exist", () => {
		expect(preferredInitialView([], 0, 8)).toBe("upcoming");
	});
});

// ---------------------------------------------------------------------------
// match sorting
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// previous match scores
// ---------------------------------------------------------------------------
describe("previous match scores", () => {
	test("formats both teams' scores for every valid game", () => {
		expect(
			previousGameScoreline([
				{ team1: 21, team2: 18 },
				{ team1: 15, team2: 21 },
				{ team1: 21, team2: 19 },
			]),
		).toBe("21-18 / 15-21 / 21-19");
	});

	test("ignores incomplete game scores", () => {
		expect(
			previousGameScoreline([{ team1: 21, team2: 18 }, { team1: 15 }]),
		).toBe("21-18");
	});
});

// ---------------------------------------------------------------------------
// live score updates
// ---------------------------------------------------------------------------
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
});

// ---------------------------------------------------------------------------
// format utilities
// ---------------------------------------------------------------------------
describe("format utilities", () => {
	test("displayRound translates BWF round codes to Japanese", () => {
		expect(displayRound("F")).toBe("決勝");
		expect(displayRound("SF")).toBe("準決勝");
		expect(displayRound("QF")).toBe("準々決勝");
		expect(displayRound("R16")).toBe("2回戦");
		expect(displayRound("R32")).toBe("1回戦");
		expect(displayRound(undefined)).toBe("");
		expect(displayRound("Group A")).toBe("Group A");
	});

	test("displayCourt converts Court N to Japanese format", () => {
		expect(displayCourt("Court 1")).toBe("第1コート");
		expect(displayCourt("Court 12")).toBe("第12コート");
		expect(displayCourt("Main Court")).toBe("Main Court");
		expect(displayCourt(undefined)).toBe("");
	});

	test("displayTournamentCategory strips HSBC BWF prefix", () => {
		expect(displayTournamentCategory("HSBC BWF World Tour Super 500")).toBe(
			"Super 500",
		);
		expect(displayTournamentCategory("Other Tour")).toBe("Other Tour");
	});

	test("formatMatchTime handles various date formats", () => {
		expect(formatMatchTime(undefined)).toBe("時刻未定");
		expect(formatMatchTime("garbage")).toBe("garbage");
		// A valid UTC time should produce a formatted string
		const result = formatMatchTime("2026-07-18 10:00:00");
		expect(result).not.toBe("時刻未定");
		expect(result).not.toBe("2026-07-18 10:00:00");
	});

	test("playerInitial returns initials for multi-word names", () => {
		expect(playerInitial("Momota Kento")).toBe("MK");
		expect(playerInitial("奥原")).toBe("奥原");
	});

	test("teamLabel joins player names or shows fallback", () => {
		expect(teamLabel({ players: [{ name: "A" }, { name: "B" }] })).toBe(
			"A / B",
		);
		expect(teamLabel(undefined)).toBe("選手不明");
	});
});

// ---------------------------------------------------------------------------
// media utilities
// ---------------------------------------------------------------------------
describe("media utilities", () => {
	test("proxiedImageUrl encodes the source URL through the proxy", () => {
		expect(proxiedImageUrl("https://example.com/photo.jpg")).toBe(
			"/api/media?url=https%3A%2F%2Fexample.com%2Fphoto.jpg",
		);
		expect(proxiedImageUrl(null)).toBe("");
		expect(proxiedImageUrl(undefined)).toBe("");
	});

	test("safeHttpsUrl upgrades HTTP to HTTPS", () => {
		expect(safeHttpsUrl("http://example.com/img.png")).toBe(
			"https://example.com/img.png",
		);
		expect(safeHttpsUrl("https://example.com/img.png")).toBe(
			"https://example.com/img.png",
		);
		expect(safeHttpsUrl(null)).toBe("");
	});
});

// ---------------------------------------------------------------------------
// static assets and configuration
// ---------------------------------------------------------------------------
describe("page structure", () => {
	test("uses square cards without decorative partial color borders", async () => {
		const css = await Bun.file("src/frontend/app.css").text();
		expect(css).toContain(
			".match {\n\tmargin-bottom: 18px;\n\tborder: 1px solid #bcbcbc;\n\tborder-radius: 0;",
		);
		expect(css).not.toContain(".live-match {");
		expect(css).not.toContain("border-top: 4px solid #d71920");
		expect(css).not.toContain("border-bottom: 3px solid #d71920");
	});

	test("does not draw a rectangular border around country flags", async () => {
		const css = await Bun.file("src/frontend/app.css").text();
		const flagRule = css.match(/\.country-flag \{([^}]+)\}/)?.[1] || "";
		expect(flagRule).not.toContain("border:");
	});

	test("uses a light interface without permanent dark surfaces", async () => {
		const css = await Bun.file("src/frontend/app.css").text();
		expect(css).toContain("color-scheme: light");
		expect(css).toContain("main {");
		expect(css).toContain("background: #ffffff");
		for (const dark of [
			"#080808",
			"#0b0b0b",
			"#171717",
			"#1b1b1b",
			"#222222",
		]) {
			expect(css).not.toContain(`background: ${dark}`);
		}
	});

	test("uses LINE Seed JP from the official Google Fonts distribution", async () => {
		const html = await Bun.file("index.html").text();
		const css = await Bun.file("src/frontend/app.css").text();
		const headers = await Bun.file("public/_headers").text();
		expect(html).toContain(
			"https://fonts.googleapis.com/css2?family=LINE+Seed+JP:wght@400;700;800&display=swap",
		);
		expect(css).toContain('"LINE Seed JP", -apple-system');
		expect(headers).toContain("font-src https://fonts.gstatic.com");
		expect(headers).toContain("style-src 'self' https://fonts.googleapis.com");
	});

	test("includes complete OGP metadata", async () => {
		const html = await Bun.file("index.html").text();
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

	test("notification image falls back to PWA icon in service worker", async () => {
		const worker = await Bun.file("src/frontend/pwa/sw.js").text();
		expect(worker).toContain("notificationMediaUrl(payload.image)");
		expect(worker).toContain('new URL("/api/media", self.location.origin)');
		expect(worker).toContain('"/pwa/icons/icon-192.png"');
	});

	test("uses BWF tournament media for match display", async () => {
		const component = await Bun.file(
			"src/frontend/components/Matches.tsx",
		).text();
		expect(component).toContain('class="tournament-logo"');
		expect(component).toContain('class="match-tournament-logo"');
		expect(component).not.toContain("tournamentHeaderImageUrl");
	});

	test("places match actions and players before secondary details", async () => {
		const component = await Bun.file(
			"src/frontend/components/Matches.tsx",
		).text();
		const primary = component.indexOf('class="match-primary-row"');
		const matchup = component.indexOf('class="matchup"');
		const h2h = component.indexOf('class="h2h"');
		expect(primary).toBeGreaterThan(0);
		expect(matchup).toBeGreaterThan(primary);
		expect(h2h).toBeGreaterThan(matchup);
	});
});
