import { describe, expect, test } from "bun:test";
import { notificationToggleAction } from "../src/frontend/lib/browser.ts";
import {
	displayCourt,
	displayRound,
	displayTournamentCategory,
	formatMatchTime,
	japanDateKey,
	playerInitial,
	previousGameScoreline,
	teamLabel,
} from "../src/frontend/lib/format.ts";
import {
	mergeLiveMatches,
	sortedMatches,
	tournamentGroups,
} from "../src/frontend/lib/matchList.ts";
import {
	proxiedImageUrl,
	resizedBwfImageUrl,
	safeHttpsUrl,
} from "../src/frontend/lib/media.ts";
import {
	IDLE_TIMEOUT_MS,
	idleRemainingMs,
	LIVE_IDLE_TIMEOUT_MS,
	pollingMode,
} from "../src/frontend/lib/pollingPolicy.ts";
import {
	countOutcomes,
	filterResults,
	gamesWon,
	groupResultsByDay,
	orderedGameScores,
	resultView,
	todayTournamentRecords,
} from "../src/frontend/lib/resultView.ts";
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

describe("idle policy", () => {
	test("keeps live scores updating while a match is watched without touching", () => {
		// スマホで10分間、得点を眺めているだけ
		expect(
			idleRemainingMs({ elapsedMs: 10 * 60_000, hasLiveMatches: true }),
		).toBeGreaterThan(0);
		expect(
			idleRemainingMs({
				elapsedMs: LIVE_IDLE_TIMEOUT_MS,
				hasLiveMatches: true,
			}),
		).toBeLessThanOrEqual(0);
	});

	test("still pauses after 5 minutes without a live match", () => {
		expect(
			idleRemainingMs({ elapsedMs: IDLE_TIMEOUT_MS, hasLiveMatches: false }),
		).toBeLessThanOrEqual(0);
		expect(idleRemainingMs({ elapsedMs: 60_000, hasLiveMatches: false })).toBe(
			IDLE_TIMEOUT_MS - 60_000,
		);
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

describe("Japan calendar date", () => {
	test("uses Japan time across the UTC date boundary", () => {
		expect(japanDateKey(new Date("2026-07-19T15:00:00Z"))).toBe("2026-07-20");
	});
});

describe("completed match perspective", () => {
	const player = (name, isJapanese) => ({ name, isJapanese });
	const match = (teams, scores) => ({ teams, scores });

	test("reports the result from the only Japanese team's perspective", () => {
		const view = resultView(
			match(
				[
					{ players: [player("Opponent", false)] },
					{ players: [player("山口茜", true)] },
				],
				[
					{ team1: 21, team2: 18 },
					{ team1: 21, team2: 16 },
				],
			),
		);
		expect(view).toMatchObject({
			kind: "international",
			leftIndex: 2,
			rightIndex: 1,
			outcome: "loss",
		});
		expect(
			orderedGameScores(
				match(
					[],
					[
						{ team1: 21, team2: 18 },
						{ team1: 21, team2: 16 },
					],
				),
				view.leftIndex,
			),
		).toEqual([
			{ left: 18, right: 21 },
			{ left: 16, right: 21 },
		]);
	});

	test("does not assign one overall Japanese result to a Japanese matchup", () => {
		expect(
			resultView(
				match(
					[
						{ players: [player("山口茜", true)] },
						{ players: [player("宮崎友花", true)] },
					],
					[
						{ team1: 21, team2: 18 },
						{ team1: 21, team2: 16 },
					],
				),
			),
		).toMatchObject({
			kind: "japanese-match",
			winner: 1,
			outcome: "japanese-match",
		});
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
// Japanese-side result summary
// ---------------------------------------------------------------------------
describe("Japanese-side result summary", () => {
	const player = (isJapanese) => ({ name: "x", isJapanese });
	const result = (id, japaneseIndex, scores) => ({
		id,
		teams:
			japaneseIndex === 1
				? [{ players: [player(true)] }, { players: [player(false)] }]
				: [{ players: [player(false)] }, { players: [player(true)] }],
		scores: scores.map(([team1, team2], index) => ({
			game: index + 1,
			team1,
			team2,
		})),
	});
	const win = result("win", 2, [
		[18, 21],
		[21, 19],
		[15, 21],
	]);
	const loss = result("loss", 1, [
		[14, 21],
		[24, 26],
	]);

	test("counts games from the Japanese side", () => {
		expect(gamesWon(win, 2)).toEqual({ left: 2, right: 1 });
		expect(gamesWon(loss, 1)).toEqual({ left: 0, right: 2 });
	});

	test("tallies and filters wins and losses of Japanese players", () => {
		expect(countOutcomes([win, loss, win])).toEqual({ win: 2, loss: 1 });
		expect(filterResults([win, loss], "win").map((m) => m.id)).toEqual(["win"]);
		expect(filterResults([win, loss], "loss").map((m) => m.id)).toEqual([
			"loss",
		]);
		expect(filterResults([win, loss], "all")).toHaveLength(2);
	});
});

// ---------------------------------------------------------------------------
// today's record per tournament
// ---------------------------------------------------------------------------
describe("today's record per tournament", () => {
	const player = (isJapanese) => ({ name: "x", isJapanese });
	const match = (id, tournament, date, outcome) => ({
		id,
		tournament,
		tournamentDate: date,
		teams:
			outcome === "japanese-match"
				? [{ players: [player(true)] }, { players: [player(true)] }]
				: [{ players: [player(true)] }, { players: [player(false)] }],
		scores:
			outcome === "win" || outcome === "japanese-match"
				? [
						{ game: 1, team1: 21, team2: 10 },
						{ game: 2, team1: 21, team2: 10 },
					]
				: outcome === "loss"
					? [
							{ game: 1, team1: 10, team2: 21 },
							{ game: 2, team1: 10, team2: 21 },
						]
					: [],
	});
	const today = "2026-11-11";

	test("shows wins and losses when every match of the day is finished", () => {
		const results = [
			match("1", "Kumamoto", today, "win"),
			match("2", "Kumamoto", today, "loss"),
			match("3", "Kumamoto", today, "win"),
			// 日本人対決は勝ち負けに数えない
			match("4", "Kumamoto", today, "japanese-match"),
			// 前日の試合は数えない
			match("5", "Kumamoto", "2026-11-10", "win"),
		];
		expect(todayTournamentRecords(results, [], today)).toEqual([
			{ tournament: "Kumamoto", win: 2, loss: 1, remaining: 0 },
		]);
	});

	test("counts remaining matches per tournament and orders by name", () => {
		const results = [match("1", "Kumamoto", today, "win")];
		const current = [
			match("2", "Kumamoto", today, "live"),
			match("3", "Kumamoto", today, "scheduled"),
			match("4", "Kaohsiung", today, "scheduled"),
			// 明日の試合は数えない
			match("5", "Kaohsiung", "2026-11-12", "scheduled"),
			// 結果に入った試合は、残りとして二重に数えない
			match("1", "Kumamoto", today, "live"),
		];
		expect(todayTournamentRecords(results, current, today)).toEqual([
			{ tournament: "Kaohsiung", win: 0, loss: 0, remaining: 1 },
			{ tournament: "Kumamoto", win: 1, loss: 0, remaining: 2 },
		]);
	});

	test("uses the date in Japan, not the venue's local date", () => {
		// 欧州で現地 11/11 の夜（UTC 16:00）に始まった試合は、日本では 11/12 の 1:00
		const overseas = {
			...match("1", "Europe", "2026-11-11", "win"),
			startTime: "2026-11-11 16:00:00",
		};
		expect(todayTournamentRecords([overseas], [], "2026-11-12")).toEqual([
			{ tournament: "Europe", win: 1, loss: 0, remaining: 0 },
		]);
		expect(todayTournamentRecords([overseas], [], "2026-11-11")).toEqual([]);
	});

	test("is empty when there are no matches today", () => {
		expect(
			todayTournamentRecords([match("1", "A", "2026-11-10", "win")], [], today),
		).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// results grouped by day
// ---------------------------------------------------------------------------
describe("results grouped by day", () => {
	test("groups by date, newest day first, keeping order within a day", () => {
		const days = groupResultsByDay([
			{ id: "a", tournamentDate: "2026-11-05" },
			{ id: "b", startTime: "2026-11-06T03:00:00Z" },
			{ id: "c", tournamentDate: "2026-11-05" },
			{ id: "d" },
			{ id: "e", tournamentDate: "2026-11-06" },
		]);
		expect(days.map((day) => day.date)).toEqual([
			"2026-11-06",
			"2026-11-05",
			undefined,
		]);
		expect(days.map((day) => day.matches.map((match) => match.id))).toEqual([
			["b", "e"],
			["a", "c"],
			["d"],
		]);
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

	test("does not add an H2H key when neither response has one", () => {
		const [merged] = mergeLiveMatches(
			[{ id: "live", eventType: "live", scores: [] }],
			[{ id: "live", eventType: "live", scores: [] }],
		);
		expect("h2h" in merged).toBe(false);
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
		expect(displayRound("Final")).toBe("決勝");
		expect(displayRound("SF")).toBe("準決勝");
		expect(displayRound("QF")).toBe("準々決勝");
		expect(displayRound("R16")).toBe("ベスト16");
		expect(displayRound("Round of 16")).toBe("ベスト16");
		expect(displayRound("R32")).toBe("ベスト32");
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
		expect(teamLabel({ players: [{ name: "A" }, { name: "B" }] })).toBe("A・B");
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

	// URLの形は公開中の /api/status が返した実データに合わせている。
	test("requests BWF images at the displayed size", () => {
		const base = "https://img.bwfbadminton.com/image/upload";
		expect(
			resizedBwfImageUrl(
				`${base}/v1590501423/assets/players/thumbnail/39276.jpg`,
				"photo",
			),
		).toBe(
			`${base}/c_fill,g_face,w_144,h_144,q_auto/v1590501423/assets/players/thumbnail/39276.jpg`,
		);
		expect(
			resizedBwfImageUrl(
				`${base}/v2/assets/flag-circle-svg-custom/JPN.png`,
				"flag",
			),
		).toBe(
			`${base}/c_limit,w_96,q_auto/v2/assets/flag-circle-svg-custom/JPN.png`,
		);
		expect(
			resizedBwfImageUrl(
				`${base}/assets/players/thumbnail/profile_male.jpg`,
				"photo",
			),
		).toBe(
			`${base}/c_fill,g_face,w_144,h_144,q_auto/assets/players/thumbnail/profile_male.jpg`,
		);
	});

	test("leaves already-transformed and non-BWF image URLs unchanged", () => {
		const named =
			"https://img.bwfbadminton.com/image/upload/t_Fansite_Homepage_Tourament_Header_big/v1/assets/tournaments/header/A.png";
		expect(resizedBwfImageUrl(named, "logo")).toBe(named);
		expect(
			resizedBwfImageUrl(
				"https://extranet.bwfbadminton.com/images/a.jpg",
				"logo",
			),
		).toBe("https://extranet.bwfbadminton.com/images/a.jpg");
		expect(resizedBwfImageUrl("not a url", "photo")).toBe("not a url");
	});

	test("proxies the resized image URL when a kind is given", () => {
		expect(
			proxiedImageUrl(
				"http://img.bwfbadminton.com/image/upload/v1/assets/players/thumbnail/1.jpg",
				"photo",
			),
		).toBe(
			`/api/media?url=${encodeURIComponent("https://img.bwfbadminton.com/image/upload/c_fill,g_face,w_144,h_144,q_auto/v1/assets/players/thumbnail/1.jpg")}`,
		);
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
	test("draws cards with one thin border and no partial color borders", async () => {
		const css = await Bun.file("src/frontend/app.css").text();
		const cardRule = css.match(/\n\.match \{([^}]+)\}/)?.[1] || "";
		expect(cardRule).toContain("border: 1px solid var(--color-line);");
		expect(css).not.toContain(".live-match {");
		expect(css).not.toMatch(/border-(top|left|right|bottom): [2-9]px solid/);
	});

	test("skips layout of off-screen cards so tab switches stay fast", async () => {
		const css = await Bun.file("src/frontend/app.css").text();
		for (const selector of [".match", ".result-day", ".result-row"]) {
			const rule =
				css.match(new RegExp(`\\n\\${selector} \\{([^}]+)\\}`))?.[1] || "";
			expect(rule).toContain("content-visibility: auto;");
			expect(rule).toContain("contain-intrinsic-size: auto");
		}
	});

	test("uses only the defined type scale and two font weights", async () => {
		const css = await Bun.file("src/frontend/app.css").text();
		const weights = new Set(
			[...css.matchAll(/font-weight: ([^;]+);/g)].map((match) => match[1]),
		);
		expect([...weights].sort()).toEqual([
			"var(--weight-bold)",
			"var(--weight-regular)",
		]);
		// 文字サイズはトークン経由だけ（数値の直接指定はトークン定義とスコアの微調整に限る）
		const rawSizes = [...css.matchAll(/font-size: (\d+px);/g)].map(
			(match) => match[1],
		);
		expect(rawSizes.every((size) => ["24px", "28px"].includes(size))).toBe(
			true,
		);
	});

	test("keeps text colors readable on white and sunken backgrounds", async () => {
		const css = await Bun.file("src/frontend/app.css").text();
		const token = (name) =>
			css.match(new RegExp(`--${name}: (#[0-9a-f]{6})`))?.[1];
		const luminance = (hex) => {
			const [r, g, b] = [1, 3, 5].map((index) => {
				const value = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
				return value <= 0.03928
					? value / 12.92
					: ((value + 0.055) / 1.055) ** 2.4;
			});
			return 0.2126 * r + 0.7152 * g + 0.0722 * b;
		};
		const contrast = (left, right) => {
			const [light, dark] = [luminance(left), luminance(right)].sort(
				(a, b) => b - a,
			);
			return (light + 0.05) / (dark + 0.05);
		};
		// 小さな文字にも使うため、WCAG AA の 4.5:1 以上にする
		for (const text of [
			"color-text",
			"color-text-secondary",
			"color-text-tertiary",
		]) {
			for (const background of ["color-surface", "color-surface-sunken"]) {
				expect(contrast(token(text), token(background))).toBeGreaterThanOrEqual(
					4.5,
				);
			}
		}
	});

	test("avoids decorative shadows and badge styling", async () => {
		const css = await Bun.file("src/frontend/app.css").text();
		expect(css).not.toContain("box-shadow");
		expect(css).not.toContain("linear-gradient");
		expect(css).not.toContain(".live-badge");
		expect(css).not.toContain(".live-label");
		expect(css).toContain(".live-state");
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
			"https://fonts.googleapis.com/css2?family=LINE+Seed+JP:wght@400;700&display=swap",
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
