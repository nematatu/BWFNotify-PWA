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

async function preparePage(page: Page) {
	await page.addInitScript(() => {
		sessionStorage.setItem("bwf-install-overlay-dismissed", "1");
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
			"rgb(247, 247, 247)",
		);
		const card = page.locator(".match:has(.matchup)").first();
		await expect(card).toHaveCSS("border-radius", "0px");
		await expect(card).toHaveCSS("border-top-width", "1px");
		await expect(card).toHaveCSS("border-top-color", "rgb(188, 188, 188)");

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
		if (process.env.CAPTURE_LAYOUT === "1") {
			await page.screenshot({
				path: `/tmp/bwfnotify-layout-${viewport.name}.png`,
				fullPage: true,
			});
		}

		await page.getByRole("tab", { name: /このあと/ }).click();
		await expect(page.locator(".player-photo-placeholder")).toHaveCount(6);
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
