import { expect, type Page, test } from "@playwright/test";

const pixel =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function flagSvg(code: string) {
	const mark =
		code === "JPN" ? '<circle cx="30" cy="20" r="10" fill="#bc002d"/>' : "";
	return `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="40"><rect width="60" height="40" fill="${code === "JPN" ? "#fff" : "#de2910"}"/>${mark}</svg>`;
}

const doublesMatch = {
	id: "layout-doubles",
	eventType: "live",
	status: "In Progress",
	startTime: "2026-07-18T09:00:00.000Z",
	tournament: "DAIHATSU Japan Open 2026",
	tournamentCategory: "HSBC BWF World Tour Super 750",
	round: "SF",
	court: "Court 1",
	players: ["福島由紀 / 松本麻佑", "JIA Yi Fan / ZHANG Shu Xian"],
	teams: [
		{
			countryCode: "JPN",
			flagUrl: "https://img.bwfbadminton.com/image/upload/JPN.png",
			players: [
				{
					name: "福島由紀",
					isJapanese: true,
					photoUrl: "https://img.bwfbadminton.com/image/upload/fukushima.jpg",
				},
				{
					name: "松本麻佑",
					isJapanese: true,
					photoUrl: "https://img.bwfbadminton.com/image/upload/matsumoto.jpg",
				},
			],
		},
		{
			countryCode: "CHN",
			flagUrl: "https://img.bwfbadminton.com/image/upload/CHN.png",
			players: [
				{
					name: "JIA Yi Fan",
					isJapanese: false,
					photoUrl: "https://img.bwfbadminton.com/image/upload/jia.jpg",
				},
				{
					name: "ZHANG Shu Xian",
					isJapanese: false,
					photoUrl: "https://img.bwfbadminton.com/image/upload/zhang.jpg",
				},
			],
		},
	],
	scores: [
		{ game: 1, team1: 21, team2: 18 },
		{ game: 2, team1: 11, team2: 9, servingTeam: 1 },
	],
	h2h: {
		team1Wins: 3,
		team2Wins: 1,
		previous: {
			date: "2025-12-18",
			tournament: "HSBC BWF World Tour Finals 2025",
			round: "R2",
			winner: 2,
			games: [
				{ team1: 18, team2: 21 },
				{ team1: 16, team2: 21 },
			],
		},
	},
};

const singlesMatch = {
	...doublesMatch,
	id: "layout-singles",
	eventType: "scheduled",
	startTime: "2026-07-18T10:00:00.000Z",
	players: ["山口茜", "AN Se Young"],
	teams: [
		{
			countryCode: "JPN",
			flagUrl: "https://img.bwfbadminton.com/image/upload/JPN.png",
			players: [{ name: "山口茜", isJapanese: true }],
		},
		{
			countryCode: "KOR",
			flagUrl: "https://img.bwfbadminton.com/image/upload/KOR.png",
			players: [{ name: "AN Se Young", isJapanese: false }],
		},
	],
	scores: [],
	h2h: undefined,
};

const secondSinglesMatch = {
	...singlesMatch,
	id: "layout-singles-2",
	startTime: "2026-07-18T11:00:00.000Z",
	players: ["奈良岡功大", "Christo POPOV"],
	teams: [
		{
			countryCode: "JPN",
			flagUrl: "https://img.bwfbadminton.com/image/upload/JPN.png",
			players: [{ name: "奈良岡功大", isJapanese: true }],
		},
		{
			countryCode: "FRA",
			flagUrl: "https://img.bwfbadminton.com/image/upload/FRA.png",
			players: [{ name: "Christo POPOV", isJapanese: false }],
		},
	],
};

const thirdSinglesMatch = {
	...singlesMatch,
	id: "layout-singles-3",
	startTime: "2026-07-18T12:00:00.000Z",
	players: ["大堀彩", "PUSARLA V. Sindhu"],
	teams: [
		{
			countryCode: "JPN",
			flagUrl: "https://img.bwfbadminton.com/image/upload/JPN.png",
			players: [{ name: "大堀彩", isJapanese: true }],
		},
		{
			countryCode: "IND",
			flagUrl: "https://img.bwfbadminton.com/image/upload/IND.png",
			players: [{ name: "PUSARLA V. Sindhu", isJapanese: false }],
		},
	],
};

const completedMatch = {
	...singlesMatch,
	id: "layout-completed",
	eventType: "completed",
	tournamentDate: "2026-07-17",
	round: "QF",
	scores: [
		{ game: 1, team1: 21, team2: 18 },
		{ game: 2, team1: 21, team2: 16 },
	],
};

const completedDoublesLoss = {
	...doublesMatch,
	id: "layout-completed-doubles-loss",
	eventType: "completed",
	tournamentDate: "2026-07-16",
	round: "R16",
	h2h: undefined,
	scores: [
		{ game: 1, team1: 18, team2: 21 },
		{ game: 2, team1: 16, team2: 21 },
	],
};

const completedJapaneseMatch = {
	...singlesMatch,
	id: "layout-completed-japanese-match",
	eventType: "completed",
	tournamentDate: "2026-07-15",
	round: "SF",
	teams: [
		singlesMatch.teams[0],
		{
			countryCode: "JPN",
			flagUrl: "https://img.bwfbadminton.com/image/upload/JPN.png",
			players: [{ name: "宮崎友花", isJapanese: true }],
		},
	],
	scores: [
		{ game: 1, team1: 21, team2: 18 },
		{ game: 2, team1: 21, team2: 16 },
	],
};

const upcomingTournament = {
	id: "2026-07-21:中国オープン2026",
	name: "中国オープン2026",
	startDate: "2026-07-21",
	endDate: "2026-07-26",
	grade: "Super 1000",
	imageUrl: "/view/tournaments/victor-china-open-2026.jpg",
	bwfUrl:
		"https://bwfworldtour.bwfbadminton.com/tournament/5622/victor-china-open-2026/overview/",
	bajUrl:
		"https://www.badminton.or.jp/storage/conventions/pdf/1252/send_out_20260626150028.pdf",
};

const augustTournament = {
	id: "2026-08-04:韓国マスターズ2026",
	name: "韓国マスターズ2026",
	startDate: "2026-08-04",
	endDate: "2026-08-09",
	bwfUrl:
		"https://bwfworldtour.bwfbadminton.com/tournament/5596/victor-korea-masters-2026/overview/",
};

async function preparePage(page: Page) {
	await page.addInitScript(() => {
		localStorage.setItem("bwf-sort-order", "time-asc");
	});
	await page.route("https://img.bwfbadminton.com/**", (route) => {
		const code = route
			.request()
			.url()
			.match(/\/(JPN|CHN|KOR|FRA|IND)\.png$/)?.[1];
		return code
			? route.fulfill({ body: flagSvg(code), contentType: "image/svg+xml" })
			: route.fulfill({
					body: Buffer.from(pixel, "base64"),
					contentType: "image/png",
				});
	});
	await page.route("**/api/media?**", (route) => {
		const source = new URL(route.request().url()).searchParams.get("url") || "";
		const code = source.match(/\/(JPN|CHN|KOR|FRA|IND)\.png$/)?.[1];
		return code
			? route.fulfill({ body: flagSvg(code), contentType: "image/svg+xml" })
			: route.fulfill({
					body: Buffer.from(pixel, "base64"),
					contentType: "image/png",
				});
	});
	await page.route("**/api/config", (route) =>
		route.fulfill({ json: { vapidPublicKey: "" } }),
	);
	await page.route("**/api/status", (route) =>
		route.fulfill({
			json: {
				checkedAt: "2026-07-18T09:00:00.000Z",
				matches: [
					doublesMatch,
					singlesMatch,
					secondSinglesMatch,
					thirdSinglesMatch,
				],
				recentResults: [
					completedMatch,
					completedDoublesLoss,
					completedJapaneseMatch,
				],
				calendarCheckedAt: "2026-07-18T08:00:00.000Z",
				upcomingTournaments: [upcomingTournament, augustTournament],
			},
		}),
	);
	await page.route("**/api/live", (route) =>
		route.fulfill({
			json: {
				checkedAt: "2026-07-18T09:00:10.000Z",
				matches: [
					{
						...doublesMatch,
						scores: [
							{ game: 1, team1: 21, team2: 18 },
							{ game: 2, team1: 12, team2: 9, servingTeam: 1 },
						],
					},
				],
			},
		}),
	);
	await page.goto("/");
	await expect(page.locator(".matchup").first()).toBeVisible();
}

type Box = {
	left: number;
	right: number;
	top: number;
	bottom: number;
};

function overlaps(left: Box, right: Box) {
	return (
		left.left < right.right &&
		left.right > right.left &&
		left.top < right.bottom &&
		left.bottom > right.top
	);
}

for (const viewport of [
	{ name: "desktop", width: 1280, height: 900 },
	{ name: "mobile", width: 390, height: 844 },
	{ name: "minimum", width: 320, height: 700 },
]) {
	test(`${viewport.name}: flags, player photos and teams stay aligned`, async ({
		page,
	}) => {
		await page.setViewportSize(viewport);
		await preparePage(page);
		await expect(page.locator("body")).toHaveCSS("font-family", /LINE Seed JP/);
		await expect(page.locator("main")).toHaveCSS(
			"background-color",
			"rgb(255, 255, 255)",
		);
		await expect(page.locator(".notification-settings")).toHaveCSS(
			"background-color",
			"rgb(240, 242, 244)",
		);
		await expect(page.locator(".match-toolbar")).toHaveCSS(
			"background-color",
			"rgb(228, 230, 232)",
		);
		await expect(page.locator('.match-tab[aria-selected="true"]')).toHaveCSS(
			"background-color",
			"rgb(255, 255, 255)",
		);
		await expect(page.locator('.match-tab[aria-selected="true"]')).toHaveCSS(
			"color",
			"rgb(38, 66, 89)",
		);
		await expect(
			page.locator('.match-tab[aria-selected="false"]').first(),
		).toHaveCSS("color", "rgb(14, 120, 196)");
		await expect(page.locator(".notification-controls")).toHaveCSS(
			"border-top-width",
			"0px",
		);
		await expect(page.locator(".sort-select")).toHaveCSS(
			"border-radius",
			"50px",
		);
		await expect(page.locator(".match-tab span").first()).toHaveCSS(
			"background-color",
			"rgba(0, 0, 0, 0)",
		);
		await expect(page.locator("#sort-order")).toHaveCSS("appearance", "none");
		await expect(
			page.getByRole("navigation", { name: "関連リンク" }),
		).toBeVisible();
		await expect(
			page.getByRole("link", { name: "GitHubリポジトリ" }),
		).toBeVisible();
		await expect(page.getByRole("link", { name: "開発者のX" })).toBeVisible();
		await expect(page.locator(".app-footer svg.brand-icon")).toHaveCount(2);
		await expect(page.locator(".footer-message")).not.toContainText("💡");
		const card = page.locator(".match:has(.matchup)").first();
		await expect(card).toHaveCSS("border-radius", "0px");
		await expect(card).toHaveCSS("border-top-width", "1px");
		await expect(card).toHaveCSS("border-top-color", "rgb(188, 188, 188)");
		for (const flag of await page.locator(".country-flag").all()) {
			await expect(flag).toHaveCSS("border-width", "0px");
		}

		const layout = await page
			.locator(".matchup")
			.first()
			.evaluate((matchup) => {
				const box = (element: HTMLElement) => {
					const rect = element.getBoundingClientRect();
					return {
						left: rect.left,
						right: rect.right,
						top: rect.top,
						bottom: rect.bottom,
					};
				};
				const teams = [...matchup.querySelectorAll<HTMLElement>(".team")];
				return teams.map((team) => ({
					team: box(team),
					names: box(
						team.querySelector<HTMLElement>(".player-names") as HTMLElement,
					),
					flag: team.querySelector<HTMLElement>(".country-flag")
						? box(
								team.querySelector<HTMLElement>(".country-flag") as HTMLElement,
							)
						: undefined,
					photos: [...team.querySelectorAll<HTMLElement>(".player-photo")].map(
						box,
					),
				}));
			});

		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= window.innerWidth,
			),
		).toBe(true);
		for (const team of layout) {
			expect(team.names.left).toBeGreaterThanOrEqual(team.team.left - 0.5);
			expect(team.names.right).toBeLessThanOrEqual(team.team.right + 0.5);
			expect(team.flag).toBeDefined();
			expect(team.flag?.left).toBeGreaterThanOrEqual(team.team.left - 0.5);
			expect(team.flag?.right).toBeLessThanOrEqual(team.team.right + 0.5);
			for (const photo of team.photos) {
				expect(photo.left).toBeGreaterThanOrEqual(team.team.left - 0.5);
				expect(photo.right).toBeLessThanOrEqual(team.team.right + 0.5);
				expect(overlaps(team.flag as Box, photo)).toBe(false);
			}
			if (team.photos.length === 2) {
				expect(overlaps(team.photos[0], team.photos[1])).toBe(false);
			}
		}
		expect(
			Math.abs(layout[0].photos[0].top - layout[1].photos[0].top),
		).toBeLessThan(0.5);
		expect(
			Math.abs((layout[0].flag?.top || 0) - (layout[1].flag?.top || 0)),
		).toBeLessThan(0.5);
		await expect(page.locator(".shuttle-indicator")).toHaveCount(1);
		await expect(page.locator(".serve-label")).toHaveCount(0);
		await expect(page.locator(".shuttle-indicator")).toHaveAttribute(
			"alt",
			"サーブ",
		);
		await expect(page.locator(".score-updated")).toHaveCount(1);
		await expect(page.locator(".score-updated strong")).toHaveText("12");
		await expect(page.locator(".h2h-scoreline strong")).toHaveText("3勝 - 1勝");
		await page.locator(".h2h-scoreline").click();
		await expect(page.locator(".previous-winner")).toHaveText(
			"JIA Yi Fan / ZHANG Shu Xian 勝利",
		);
		await expect(page.locator(".previous-scoreline")).toHaveText(
			"18-21 / 16-21",
		);
		await expect(
			page.locator(".live-match .match-notification-control"),
		).toHaveCount(0);
		await expect(page.getByRole("link", { name: "配信を見る" })).toHaveCount(0);
		await page.getByRole("tab", { name: /結果/ }).click();
		const resultRows = page.locator(".result-row");
		await expect(resultRows).toHaveCount(3);
		await expect(resultRows.nth(0)).toHaveClass(/result-win/);
		await expect(resultRows.nth(0)).toHaveCSS("background-image", "none");
		await expect(resultRows.nth(0)).toHaveCSS(
			"background-color",
			"rgb(255, 255, 255)",
		);
		await expect(resultRows.nth(0).locator(".result-outcome")).toHaveText(
			"WIN",
		);
		await expect(resultRows.nth(1)).toHaveClass(/result-loss/);
		await expect(resultRows.nth(1)).toHaveCSS("background-image", "none");
		await expect(resultRows.nth(1)).toHaveCSS(
			"background-color",
			"rgb(255, 255, 255)",
		);
		await expect(resultRows.nth(1).locator(".result-outcome")).toHaveText(
			"LOSE",
		);
		await expect(resultRows.nth(2)).toHaveClass(/result-japanese-match/);
		await expect(resultRows.nth(2).locator(".result-outcome")).toHaveText(
			"日本人対決",
		);
		await expect(resultRows.nth(2).locator(".team-result")).toHaveText([
			"WIN",
			"LOSE",
		]);
		await expect(resultRows.nth(2).locator(".result-team-japan")).toHaveCount(
			2,
		);
		for (const row of await resultRows.all()) {
			await expect(
				row.locator(".result-matchup > .result-team").first(),
			).toHaveClass(/result-team-japan/);
			await expect(row.locator(".result-flag")).toHaveCount(2);
		}
		await expect(resultRows.nth(0).locator(".team-result")).toHaveCount(0);
		await expect(resultRows.nth(0).locator(".result-meta")).toContainText(
			"DAIHATSU Japan Open 2026",
		);
		await expect(resultRows.nth(0).locator(".result-meta")).toContainText(
			"準々決勝",
		);
		await expect(resultRows.nth(0).locator(".result-meta > *")).toHaveText([
			"DAIHATSU Japan Open 2026",
			"準々決勝",
			"2026/07/17",
		]);
		await expect(resultRows.nth(1).locator(".result-meta")).toContainText(
			"ベスト16",
		);
		await expect(resultRows.nth(0).locator(".result-team-japan")).toContainText(
			"山口茜",
		);
		const doublesNames = resultRows
			.nth(1)
			.locator(".result-team-japan .result-player-names");
		await expect(doublesNames).toContainText("福島由紀");
		await expect(doublesNames).toContainText("松本麻佑");
		await expect(doublesNames.locator(".result-name-separator")).toHaveText(
			"/",
		);
		await expect(doublesNames).toHaveCSS("white-space", "normal");
		await expect(resultRows.nth(1).locator(".result-player-photo")).toHaveCount(
			4,
		);
		const [japaneseNameSize, opponentNameSize] = await Promise.all([
			doublesNames.evaluate((element) =>
				Number.parseFloat(getComputedStyle(element).fontSize),
			),
			resultRows
				.nth(1)
				.locator(".result-team:not(.result-team-japan) .result-player-names")
				.evaluate((element) =>
					Number.parseFloat(getComputedStyle(element).fontSize),
				),
		]);
		expect(japaneseNameSize).toBeGreaterThan(opponentNameSize);
		const resultAlignment = await resultRows.nth(0).evaluate((row) => {
			const matchup = row.querySelector<HTMLElement>(".result-matchup");
			const teams = row.querySelectorAll<HTMLElement>(".result-team");
			const score = row.querySelector<HTMLElement>(".result-score");
			const centers = (elements: NodeListOf<HTMLElement>) =>
				[...elements].map((element) => {
					const box = element.getBoundingClientRect();
					return box.left + box.width / 2;
				});
			return {
				teamCenters: centers(teams),
				photoCenters: centers(
					row.querySelectorAll<HTMLElement>(".result-player-photos"),
				),
				flagCenters: centers(
					row.querySelectorAll<HTMLElement>(".result-team-head"),
				),
				nameCenters: centers(
					row.querySelectorAll<HTMLElement>(".result-player-names"),
				),
				scoreCenter: score
					? score.getBoundingClientRect().left +
						score.getBoundingClientRect().width / 2
					: 0,
				matchupCenter: matchup
					? matchup.getBoundingClientRect().left +
						matchup.getBoundingClientRect().width / 2
					: 0,
				scorePaddingTop: score
					? Number.parseFloat(getComputedStyle(score).paddingTop)
					: -1,
			};
		});
		for (const index of [0, 1]) {
			expect(
				Math.abs(
					resultAlignment.teamCenters[index] -
						resultAlignment.photoCenters[index],
				),
			).toBeLessThan(1);
			expect(
				Math.abs(
					resultAlignment.teamCenters[index] -
						resultAlignment.flagCenters[index],
				),
			).toBeLessThan(1);
			expect(
				Math.abs(
					resultAlignment.teamCenters[index] -
						resultAlignment.nameCenters[index],
				),
			).toBeLessThan(1);
		}
		expect(
			Math.abs(resultAlignment.scoreCenter - resultAlignment.matchupCenter),
		).toBeLessThan(1);
		expect(resultAlignment.scorePaddingTop).toBeLessThan(20);
		await expect(page.locator(".result-details")).toHaveCount(0);
		if (process.env.CAPTURE_LAYOUT === "1") {
			await page.screenshot({
				path: `/tmp/bwfnotify-results-${viewport.name}.png`,
				fullPage: true,
			});
		}
		await page.getByRole("tab", { name: /大会/ }).click();
		await expect(page.locator(".upcoming-row")).toHaveCount(2);
		await expect(page.locator(".upcoming-row").first()).toContainText(
			"中国オープン2026",
		);
		await expect(
			page.locator(".upcoming-row").first().locator(".tournament-watermark"),
		).toHaveAttribute("src", "/view/tournaments/victor-china-open-2026.jpg");
		const plainTournament = page.locator(".upcoming-row").nth(1);
		await expect(plainTournament).toHaveCSS(
			"background-color",
			"rgba(0, 0, 0, 0)",
		);
		await plainTournament.hover();
		await expect(plainTournament).toHaveCSS(
			"background-color",
			"rgba(0, 0, 0, 0)",
		);
		await expect(plainTournament.locator(".upcoming-main")).toHaveCSS(
			"background-color",
			"rgba(0, 0, 0, 0)",
		);
		await expect(page.locator(".upcoming-row").first()).not.toContainText(
			/選手|所属|時刻|コート|Court/,
		);
		await expect(
			page.getByRole("link", { name: /中国オープン2026をBWFで開く/ }),
		).toHaveCount(1);
		await expect(
			page.getByRole("link", {
				name: /中国オープン2026を日本バドミントン協会で確認する/,
			}),
		).toHaveCount(1);
		await page
			.getByRole("button", { name: "中国オープン2026の詳細を表示" })
			.click();
		await expect(page.locator(".tournament-overlay")).toBeVisible();
		await expect(page.locator(".tournament-overlay")).toContainText(
			"中国オープン2026",
		);
		await page.getByRole("button", { name: "大会詳細を閉じる" }).click();
		await page.getByRole("button", { name: "カレンダー" }).click();
		await expect(page.locator(".month-calendar")).toHaveCount(1);
		await expect(page.locator(".calendar-weekdays span")).toHaveText([
			"日",
			"月",
			"火",
			"水",
			"木",
			"金",
			"土",
		]);
		await expect(page.locator(".calendar-day")).toHaveCount(35);
		await expect(page.locator(".calendar-day.active")).toHaveCount(6);
		await expect(page.locator(".calendar-event")).toHaveCount(2);
		await expect(page.getByRole("button", { name: "前の月" })).toBeDisabled();
		await expect(page.getByRole("button", { name: "次の月" })).toBeEnabled();
		await expect(page.locator(".calendar-sources")).toHaveCount(0);
		await expect(
			page.locator(".calendar-event .external-link-mark"),
		).toHaveCount(2);
		const linkedEvent = page.locator(".calendar-event.has-links").first();
		const [eventNameBox, eventLinksBox] = await Promise.all([
			linkedEvent.locator(".calendar-event-name").boundingBox(),
			linkedEvent.locator(".tournament-links").boundingBox(),
		]);
		expect(eventNameBox).not.toBeNull();
		expect(eventLinksBox).not.toBeNull();
		expect(
			(eventNameBox?.x || 0) + (eventNameBox?.width || 0),
		).toBeLessThanOrEqual((eventLinksBox?.x || 0) + 0.5);
		await page.locator(".calendar-event-button").first().click();
		await expect(page.locator(".tournament-overlay")).toContainText(
			"中国オープン2026",
		);
		await expect(
			page.locator(".tournament-overlay .external-link-mark"),
		).toHaveCount(2);
		await page.getByRole("button", { name: "大会詳細を閉じる" }).click();
		await page.getByRole("button", { name: "次の月" }).click();
		await expect(page.locator(".calendar-month h3")).toHaveText("2026年8月");
		await expect(page.locator(".calendar-event")).toContainText([
			"韓国マスターズ2026",
			"韓国マスターズ2026",
		]);
		await expect(page.locator(".tournament-calendar")).toHaveCount(0);
		expect(
			await page.evaluate(
				() => getComputedStyle(document.documentElement).scrollbarGutter,
			),
		).toContain("stable");
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= window.innerWidth,
			),
		).toBe(true);
		if (process.env.CAPTURE_LAYOUT === "1") {
			await page.screenshot({
				path: `/tmp/bwfnotify-layout-${viewport.name}.png`,
				fullPage: true,
			});
		}

		await page.getByRole("tab", { name: /このあと/ }).click();
		await expect(page.locator(".player-photo-placeholder")).toHaveCount(6);
		await expect(
			page.locator(".scheduled-match .match-notification-control"),
		).toHaveCount(3);
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= window.innerWidth,
			),
		).toBe(true);
	});
}

test("wide: match cards use multiple columns in both sort modes", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await preparePage(page);
	await page.getByRole("tab", { name: /このあと/ }).click();

	const timeCards = page.locator(".match-list.time-grid > .match");
	await expect(timeCards).toHaveCount(3);
	const timePositions = await timeCards.evaluateAll((cards) =>
		cards.map((card) => {
			const rect = card.getBoundingClientRect();
			return { left: rect.left, top: rect.top };
		}),
	);
	expect(new Set(timePositions.map((position) => position.top)).size).toBe(1);
	expect(
		Math.abs(timePositions[0].left - timePositions[1].left),
	).toBeGreaterThan(400);
	if (process.env.CAPTURE_LAYOUT === "1") {
		await page.screenshot({
			path: "/tmp/bwfnotify-layout-wide-time.png",
			fullPage: true,
		});
	}

	await page.locator("#sort-order").selectOption("tournament");
	const groupedCards = page.locator(".tournament-matches > .match");
	await expect(groupedCards).toHaveCount(3);
	const groupedPositions = await groupedCards.evaluateAll((cards) =>
		cards.map((card) => {
			const rect = card.getBoundingClientRect();
			return { left: rect.left, top: rect.top };
		}),
	);
	expect(new Set(groupedPositions.map((position) => position.top)).size).toBe(
		1,
	);
	expect(
		Math.abs(groupedPositions[0].left - groupedPositions[1].left),
	).toBeGreaterThan(400);
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= window.innerWidth,
		),
	).toBe(true);
	if (process.env.CAPTURE_LAYOUT === "1") {
		await page.screenshot({
			path: "/tmp/bwfnotify-layout-wide-tournament.png",
			fullPage: true,
		});
	}
});

test("opens results when there are no live or scheduled matches", async ({
	page,
}) => {
	await page.route("**/api/config", (route) =>
		route.fulfill({ json: { vapidPublicKey: "" } }),
	);
	await page.route("**/api/media?**", (route) =>
		route.fulfill({
			body: Buffer.from(pixel, "base64"),
			contentType: "image/png",
		}),
	);
	await page.route("**/api/status", (route) =>
		route.fulfill({
			json: {
				checkedAt: "2026-07-20T00:00:00.000Z",
				matches: [],
				recentResults: [completedMatch],
				calendarCheckedAt: "2026-07-20T00:00:00.000Z",
				upcomingTournaments: [upcomingTournament],
			},
		}),
	);

	await page.goto("/");
	await expect(page.getByRole("tab", { name: "結果 1" })).toHaveAttribute(
		"aria-selected",
		"true",
	);
	await expect(page.locator(".result-row")).toHaveCount(1);

	await page.getByRole("tab", { name: "大会 1" }).click();
	await expect(page.locator(".upcoming-row")).toHaveCount(1);
});

test("match information hierarchy prioritizes actions and matchup", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await preparePage(page);
	await page.getByRole("tab", { name: /このあと/ }).click();
	const card = page.locator(".scheduled-match").first();
	const layout = await card.evaluate((element) => {
		const rect = (selector: string) => {
			const value = element.querySelector<HTMLElement>(selector);
			if (!value) throw new Error(`Missing ${selector}`);
			const box = value.getBoundingClientRect();
			return { top: box.top, bottom: box.bottom, height: box.height };
		};
		return {
			primary: rect(".match-primary-row"),
			header: rect(".match-header"),
			tournament: rect(".match-tournament"),
			matchup: rect(".matchup"),
		};
	});
	expect(layout.primary.top).toBeLessThan(layout.matchup.top);
	expect(layout.header.top).toBeLessThan(layout.matchup.top);
	expect(layout.tournament.height).toBeLessThan(layout.matchup.height / 2);
	await expect(card.locator(".match-primary-row .match-time")).toBeVisible();
	await expect(card.locator(".match-notification-control")).toBeVisible();
});

test("normal polling switches to live score polling after a match starts", async ({
	page,
}) => {
	await page.clock.install({ time: new Date("2026-07-18T09:00:00.000Z") });
	let statusCalls = 0;
	let liveCalls = 0;
	await page.route("**/api/config", (route) =>
		route.fulfill({ json: { vapidPublicKey: "" } }),
	);
	await page.route("**/api/status", (route) => {
		statusCalls += 1;
		return route.fulfill({
			json: {
				checkedAt: "2026-07-18T09:00:00.000Z",
				matches: statusCalls === 1 ? [singlesMatch] : [doublesMatch],
			},
		});
	});
	await page.route("**/api/live", (route) => {
		liveCalls += 1;
		return route.fulfill({
			json: {
				checkedAt: "2026-07-18T09:02:15.000Z",
				matches: [doublesMatch],
			},
		});
	});

	await page.goto("/");
	await expect(page.locator("#scheduled-count")).toHaveText("1");
	expect(statusCalls).toBe(1);
	expect(liveCalls).toBe(0);

	await page.clock.fastForward(120_000);
	await expect(page.locator("#live-count")).toHaveText("1");
	expect(statusCalls).toBe(2);

	await page.clock.fastForward(15_000);
	await expect.poll(() => liveCalls).toBe(1);
});

test("production build keeps its manifest and service worker", async ({
	page,
}) => {
	await preparePage(page);
	await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
		"href",
		"/pwa/manifest.webmanifest",
	);
	await expect
		.poll(() =>
			page.evaluate(async () => {
				const registrations = await navigator.serviceWorker.getRegistrations();
				return registrations.some((registration) =>
					registration.active?.scriptURL.endsWith("/pwa/sw.js"),
				);
			}),
		)
		.toBe(true);
});

test("blocked notification permission keeps the toggle actionable", async ({
	page,
}) => {
	await preparePage(page);
	await expect(page.locator("#notification-status")).toHaveText(
		"通知がブロックされています",
	);
	const toggle = page.locator("#notification-toggle");
	await expect(toggle).toBeEnabled();
	await page.locator(".notification-settings .switch-track").click();
	await expect(page.locator("#blocked-permission-overlay")).toBeVisible();
	await expect(page.locator("#blocked-permission-retry")).toBeVisible();
});

test("regular browsers can start notification setup without installing the PWA", async ({
	page,
}) => {
	await page.addInitScript(() => {
		Object.defineProperty(Notification, "permission", {
			configurable: true,
			get: () => "default",
		});
	});
	await preparePage(page);
	await expect(page.locator("#notification-status")).toHaveText("オフ");
	await expect(page.locator("#notification-toggle")).toBeEnabled();
	await page.locator(".notification-settings .switch-track").click();
	await expect(page.locator("#permission-overlay")).toBeVisible();
	await expect(page.locator("#install-overlay")).toHaveCount(0);
});
