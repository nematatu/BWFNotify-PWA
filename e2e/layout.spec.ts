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

async function preparePage(page: Page) {
	await page.addInitScript(() => {
		sessionStorage.setItem("bwf-install-overlay-dismissed", "1");
		localStorage.setItem("bwf-sort-order", "time-asc");
	});
	await page.route("https://img.bwfbadminton.com/**", (route) => {
		const code = route
			.request()
			.url()
			.match(/\/(JPN|CHN|KOR)\.png$/)?.[1];
		return code
			? route.fulfill({ body: flagSvg(code), contentType: "image/svg+xml" })
			: route.fulfill({
					body: Buffer.from(pixel, "base64"),
					contentType: "image/png",
				});
	});
	await page.route("**/api/media?**", (route) => {
		const source = new URL(route.request().url()).searchParams.get("url") || "";
		const code = source.match(/\/(JPN|CHN|KOR)\.png$/)?.[1];
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
				matches: [doublesMatch, singlesMatch],
			},
		}),
	);
	await page.route("**/api/live", (route) =>
		route.fulfill({
			json: {
				checkedAt: "2026-07-18T09:00:10.000Z",
				matches: [doublesMatch],
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
		if (process.env.CAPTURE_LAYOUT === "1") {
			await page.screenshot({
				path: `/tmp/bwfnotify-layout-${viewport.name}.png`,
				fullPage: true,
			});
		}

		await page.getByRole("tab", { name: /このあと/ }).click();
		await expect(page.locator(".player-photo-placeholder")).toHaveCount(2);
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= window.innerWidth,
			),
		).toBe(true);
	});
}
