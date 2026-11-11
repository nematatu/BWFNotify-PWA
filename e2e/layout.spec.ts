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

/** デザイントークン（CSSカスタムプロパティ）の色を、計算後の rgb() 表記で返す。 */
function tokenColor(page: Page, token: string) {
	return page.evaluate((name) => {
		const probe = document.createElement("span");
		probe.style.color = `var(${name})`;
		document.body.append(probe);
		const color = getComputedStyle(probe).color;
		probe.remove();
		return color;
	}, token);
}

async function preparePage(page: Page) {
	await page.clock.install({ time: new Date("2026-07-18T09:00:00.000Z") });
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
		// 色はデザイントークンの値だけを使う
		const surface = await tokenColor(page, "--color-surface");
		const sunken = await tokenColor(page, "--color-surface-sunken");
		const text = await tokenColor(page, "--color-text");
		const textSecondary = await tokenColor(page, "--color-text-secondary");
		await expect(page.locator("main")).toHaveCSS("background-color", surface);
		await expect(page.locator(".notification-settings")).toHaveCSS(
			"background-color",
			sunken,
		);
		await expect(page.locator(".match-tabs")).toHaveCSS(
			"background-color",
			sunken,
		);
		await expect(page.locator('.match-tab[aria-selected="true"]')).toHaveCSS(
			"background-color",
			surface,
		);
		await expect(page.locator('.match-tab[aria-selected="true"]')).toHaveCSS(
			"color",
			text,
		);
		await expect(
			page.locator('.match-tab[aria-selected="false"]').first(),
		).toHaveCSS("color", textSecondary);
		// 太字は選択中のタブだけ
		await expect(page.locator('.match-tab[aria-selected="true"]')).toHaveCSS(
			"font-weight",
			"700",
		);
		await expect(
			page.locator('.match-tab[aria-selected="false"]').first(),
		).toHaveCSS("font-weight", "400");
		await expect(page.locator(".notification-controls")).toHaveCSS(
			"border-top-width",
			"0px",
		);
		await expect(page.locator(".match-tab span").first()).toHaveCSS(
			"background-color",
			"rgba(0, 0, 0, 0)",
		);
		const sortButton = page.locator(".sort-select-button");
		await expect(sortButton).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
		await sortButton.click();
		const openedSortOptions = page.getByRole("listbox", { name: "ソート順" });
		await expect(openedSortOptions).toHaveCSS("background-color", surface);
		// 開いてもボタンを色で塗りつぶさない（ホバー時の薄い背景だけ）
		await expect(sortButton).not.toHaveCSS(
			"background-color",
			await tokenColor(page, "--color-accent"),
		);
		await openedSortOptions
			.getByRole("option", { name: "時間が早い順" })
			.click();
		const toolbarLayout = () =>
			page.locator(".match-toolbar").evaluate((toolbar) => {
				const tabs = toolbar
					.querySelector(".match-tabs")
					?.getBoundingClientRect();
				const refresh = toolbar
					.querySelector("#refresh-button")
					?.getBoundingClientRect();
				const bounds = toolbar.getBoundingClientRect();
				return {
					top: bounds.top,
					height: bounds.height,
					tabsLeft: tabs?.left,
					tabsTop: tabs?.top,
					refreshLeft: refresh?.left,
					refreshTop: refresh?.top,
				};
			});
		await page.getByRole("tab", { name: /ライブ/ }).click();
		const liveToolbarLayout = await toolbarLayout();
		await expect(page.locator(".match-sort-toolbar")).toBeVisible();
		await page.getByRole("tab", { name: /結果/ }).click();
		await expect(page.locator(".match-sort-toolbar")).toHaveCount(0);
		expect(await toolbarLayout()).toEqual(liveToolbarLayout);
		await page.getByRole("tab", { name: /大会/ }).click();
		expect(await toolbarLayout()).toEqual(liveToolbarLayout);
		await page.getByRole("tab", { name: /ライブ/ }).click();
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
		await expect(card).toHaveCSS("border-top-width", "1px");
		await expect(card).toHaveCSS(
			"border-top-color",
			await tokenColor(page, "--color-line"),
		);
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
		// 対戦成績は、日本人選手（左のチーム）から見た「N勝M敗」で示す
		await expect(page.locator(".live-match .h2h-record")).toHaveText("3勝1敗");
		// 日本人選手の欄は背景色で示す（相手側には付けない）
		const japanPanel = await tokenColor(page, "--color-japan");
		await expect(page.locator(".live-match .japanese-team")).toHaveCSS(
			"background-color",
			japanPanel,
		);
		await expect(page.locator(".live-match .foreign-team")).toHaveCSS(
			"background-color",
			"rgba(0, 0, 0, 0)",
		);
		await expect(page.locator(".current-game")).toContainText("ゲーム");
		await expect(page.locator(".game-score span").first()).toHaveText(
			"第1ゲーム",
		);
		await page.locator(".h2h-scoreline").click();
		await expect(page.locator(".previous-winner")).toHaveText(
			"JIA Yi Fan・ZHANG Shu Xian 勝利",
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
		// 試合結果は日付ごとにまとめ、新しい日付から並べる
		await expect(page.locator(".result-day-heading time")).toHaveText([
			"7月17日（金）",
			"7月16日（木）",
			"7月15日（水）",
		]);
		await expect(resultRows.nth(0)).toHaveClass(/result-win/);
		await expect(resultRows.nth(0)).toHaveCSS("background-image", "none");
		await expect(resultRows.nth(0)).toHaveCSS(
			"background-color",
			"rgb(255, 255, 255)",
		);
		// 日本人選手側の勝敗を、カード上部の帯の色と文字で示す（勝ちは緑、負けは灰色）
		await expect(resultRows.nth(0).locator(".result-outcome")).toHaveText(
			"勝ち",
		);
		await expect(resultRows.nth(0).locator(".result-header")).toHaveCSS(
			"background-color",
			await tokenColor(page, "--color-win"),
		);
		await expect(resultRows.nth(0).locator(".result-games")).toContainText(
			"2-0",
		);
		await expect(resultRows.nth(1)).toHaveClass(/result-loss/);
		await expect(resultRows.nth(1)).toHaveCSS("background-image", "none");
		await expect(resultRows.nth(1)).toHaveCSS(
			"background-color",
			"rgb(255, 255, 255)",
		);
		await expect(resultRows.nth(1).locator(".result-outcome")).toHaveText(
			"負け",
		);
		await expect(resultRows.nth(1).locator(".result-header")).toHaveCSS(
			"background-color",
			await tokenColor(page, "--color-loss"),
		);
		await expect(resultRows.nth(2)).toHaveClass(/result-japanese-match/);
		await expect(resultRows.nth(2).locator(".result-outcome")).toHaveText(
			"日本人対決",
		);
		// 日本人対決では、勝った側にだけ「勝ち」の印を付ける
		await expect(resultRows.nth(2).locator(".team-result")).toHaveText([
			"勝ち",
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
		// 日本人対決以外では、海外選手が勝っても印を付けない（勝敗は日本人側の帯で示す）
		await expect(resultRows.nth(1).locator(".team-result")).toHaveCount(0);
		// 黄色の背景は勝った日本人選手の欄だけに付け、負けた試合では付けない
		await expect(resultRows.nth(0).locator(".result-team-japan")).toHaveCSS(
			"background-color",
			japanPanel,
		);
		await expect(resultRows.nth(1).locator(".result-team-japan")).not.toHaveCSS(
			"background-color",
			japanPanel,
		);
		await expect(
			resultRows.nth(2).locator(".result-team-japan-won"),
		).toHaveCount(1);
		await expect(
			resultRows.nth(2).locator(".result-team-japan-won .team-result"),
		).toHaveText("勝ち");
		// 集計と絞り込み
		await expect(page.locator(".result-total-win")).toHaveText("1勝");
		await expect(page.locator(".result-total-loss")).toHaveText("1敗");
		await page.getByRole("button", { name: "負け", exact: true }).click();
		// 絞り込みでは行を作り直さず、該当しない行を隠す
		const visibleRows = page.locator(".result-row:visible");
		await expect(visibleRows).toHaveCount(1);
		await expect(visibleRows.first()).toHaveClass(/result-loss/);
		await page.getByRole("button", { name: "すべて" }).click();
		await expect(visibleRows).toHaveCount(3);
		// 各ゲームで勝った側の得点だけを太字にする
		await expect(
			resultRows.nth(0).locator(".result-game").first().locator(".game-won"),
		).toHaveCount(1);
		await expect(resultRows.nth(0).locator(".result-meta")).toContainText(
			"DAIHATSU Japan Open 2026",
		);
		await expect(resultRows.nth(0).locator(".result-meta")).toContainText(
			"準々決勝",
		);
		// 日付は日付見出しに出すため、各行には大会名とラウンドだけを出す
		await expect(resultRows.nth(0).locator(".result-meta > *")).toHaveText([
			"DAIHATSU Japan Open 2026",
			"準々決勝",
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
			"、",
		);
		// ペアの区切りは読み上げ用で、画面には出さない
		await expect(doublesNames.locator(".result-name-separator")).toHaveCSS(
			"position",
			"absolute",
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
		// 左右のチームで、写真・国旗・名前の高さ位置が一致する（日本人選手側が2行になっても）
		const rowOffsets = await resultRows.evaluateAll((rows) =>
			rows.flatMap((row) => {
				const teams = row.querySelectorAll(".result-team");
				return [
					".result-player-photos",
					".result-team-head",
					".result-player-names",
				].map((selector) =>
					Math.abs(
						(teams[0]?.querySelector(selector)?.getBoundingClientRect().top ??
							0) -
							(teams[1]?.querySelector(selector)?.getBoundingClientRect().top ??
								0),
					),
				);
			}),
		);
		expect(Math.max(...rowOffsets)).toBeLessThan(1);
		// カード内の各行（帯・大会名・対戦）は同じ左端から始まる
		const leftEdges = await resultRows.first().evaluate((row) => {
			const left = (selector: string) =>
				row.querySelector(selector)?.firstElementChild?.getBoundingClientRect()
					.left ?? Number.NaN;
			return [
				left(".result-header"),
				left(".result-meta"),
				left(".result-matchup"),
			];
		});
		expect(Math.max(...leftEdges) - Math.min(...leftEdges)).toBeLessThan(1);
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
		const firstTournamentMain = page.locator(".upcoming-main").first();
		await expect(firstTournamentMain.locator(".upcoming-grade")).toHaveText(
			"Super 1000",
		);
		await expect(firstTournamentMain.locator(".upcoming-period")).toContainText(
			"開催期間7月21日（火）〜7月26日（日）",
		);
		expect(
			await firstTournamentMain.evaluate((element) =>
				[...element.children].map(
					(child) => child.className || child.tagName.toLowerCase(),
				),
			),
		).toEqual(["upcoming-grade", "h4", "upcoming-period"]);
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
		if (process.env.CAPTURE_LAYOUT === "1") {
			await page.screenshot({
				path: `/tmp/bwfnotify-upcoming-${viewport.name}.png`,
				fullPage: true,
			});
		}
		const monthBorders = await page.evaluate(() => {
			const group = document.createElement("section");
			group.className = "upcoming-month-group";
			const header = document.createElement("header");
			const month = document.createElement("strong");
			month.textContent = "12月";
			const year = document.createElement("span");
			year.textContent = "2026年";
			header.append(month, year);
			const events = document.createElement("div");
			events.className = "upcoming-month-events";
			for (let index = 0; index < 4; index += 1) {
				const row = document.createElement("article");
				row.className = "upcoming-row";
				events.append(row);
			}
			group.append(header, events);
			document.body.append(group);
			const borders = [...events.children].map(
				(row) => getComputedStyle(row).borderBottomWidth,
			);
			const groupBorder = getComputedStyle(group).borderBottomWidth;
			const monthBox = month.getBoundingClientRect();
			const yearBox = year.getBoundingClientRect();
			const monthYearAligned =
				Math.abs(monthBox.bottom - yearBox.bottom) < 12 &&
				yearBox.left >= monthBox.right;
			group.remove();
			return { borders, groupBorder, monthYearAligned };
		});
		expect(monthBorders.borders).toEqual(
			viewport.width <= 720
				? ["1px", "1px", "1px", "0px"]
				: ["1px", "1px", "0px", "0px"],
		);
		expect(monthBorders.groupBorder).toBe("1px");
		expect(monthBorders.monthYearAligned).toBe(true);
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
		const [eventNameBox, eventLinksBox, otherEventBox] = await Promise.all([
			linkedEvent.locator(".calendar-event-name").boundingBox(),
			linkedEvent.locator(".tournament-links").boundingBox(),
			page.locator(".calendar-event").nth(1).boundingBox(),
		]);
		expect(eventNameBox).not.toBeNull();
		expect(eventLinksBox).not.toBeNull();
		expect(otherEventBox).not.toBeNull();
		expect(
			(eventNameBox?.x || 0) + (eventNameBox?.width || 0),
		).toBeLessThanOrEqual((eventLinksBox?.x || 0) + 0.5);
		await linkedEvent.hover();
		expect(
			await linkedEvent.evaluate(
				(element) => getComputedStyle(element, "::after").backgroundColor,
			),
		).toBe("rgba(255, 255, 255, 0.16)");
		await expect(linkedEvent.locator(".calendar-event-button")).toHaveCSS(
			"background-color",
			"rgba(0, 0, 0, 0)",
		);
		await page.locator(".calendar-event-button").first().click();
		await expect(page.locator(".tournament-overlay")).toContainText(
			"中国オープン2026",
		);
		await page.mouse.click(4, 4);
		await expect(page.locator(".tournament-overlay")).toBeHidden();
		await page.locator(".calendar-event-button").first().click();
		await page.mouse.click(
			(otherEventBox?.x || 0) + (otherEventBox?.width || 0) / 2,
			(otherEventBox?.y || 0) + (otherEventBox?.height || 0) / 2,
		);
		await expect(page.locator(".tournament-overlay")).toBeHidden();
		await page.locator(".calendar-event-button").first().click();
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

	const timeCards = page.locator(
		".view-panel:not([hidden]) .match-list.time-grid > .match",
	);
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

	await page.getByRole("button", { name: "ソート順: 時間が早い順" }).click();
	const sortOptions = page.getByRole("listbox", { name: "ソート順" });
	await expect(sortOptions).toHaveCSS(
		"background-color",
		await tokenColor(page, "--color-surface"),
	);
	if (process.env.CAPTURE_LAYOUT === "1") {
		await page.screenshot({
			path: "/tmp/bwfnotify-sort-menu.png",
			fullPage: true,
		});
	}
	await sortOptions.getByRole("option", { name: "大会名順" }).click();
	const groupedCards = page.locator(
		".view-panel:not([hidden]) .match-list.tournament-order > .match",
	);
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
	await page.clock.install({ time: new Date("2026-07-20T09:00:00.000Z") });
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

test("switching tabs reuses the rendered results instead of rebuilding them", async ({
	page,
}) => {
	await preparePage(page);
	await page.goto("/");
	await page.getByRole("tab", { name: /結果/ }).click();
	const firstRow = page.locator(".result-row").first();
	await expect(firstRow).toBeVisible();
	// 作り直されると、この印は消える
	await firstRow.evaluate((row) => {
		row.dataset.marker = "kept";
	});

	await page.getByRole("tab", { name: /ライブ/ }).click();
	// 隠したタブは見えず、場所も取らない
	await expect(firstRow).toBeHidden();
	await expect(page.locator(".live-match").first()).toBeVisible();
	const hiddenPanelHeight = await page
		.locator(".view-panel", { has: page.locator(".result-row") })
		.evaluate((panel) => panel.getBoundingClientRect().height);
	expect(hiddenPanelHeight).toBe(0);

	await page.getByRole("tab", { name: /結果/ }).click();
	await expect(firstRow).toBeVisible();
	await expect(firstRow).toHaveAttribute("data-marker", "kept");
});

test("filters, sorting and refreshes reuse the rendered cards", async ({
	page,
}) => {
	await preparePage(page);
	const markFirst = (selector: string) =>
		page
			.locator(selector)
			.first()
			.evaluate((element) => {
				element.dataset.marker = "kept";
			});

	// 勝ち・負けの絞り込みは、行を作り直さず隠すだけにする
	await page.getByRole("tab", { name: /結果/ }).click();
	await markFirst(".result-row.result-win");
	await page.getByRole("button", { name: "負け", exact: true }).click();
	await expect(page.locator(".result-row.result-win").first()).toBeHidden();
	await expect(page.locator(".result-row:visible")).toHaveCount(1);
	await page.getByRole("button", { name: "すべて" }).click();
	await expect(page.locator(".result-row.result-win").first()).toHaveAttribute(
		"data-marker",
		"kept",
	);

	// 並び方を変えても、試合カードは作り直さない
	await page.getByRole("tab", { name: /このあと/ }).click();
	await markFirst(".view-panel:not([hidden]) .match");
	const markedCard = page.locator('.match[data-marker="kept"]');
	await page.getByRole("button", { name: /ソート順/ }).click();
	await page.getByRole("option", { name: "大会名順" }).click();
	await expect(
		page.locator(".view-panel:not([hidden]) .tournament-heading").first(),
	).toBeVisible();
	await expect(markedCard).toHaveCount(1);
	await page.getByRole("button", { name: /ソート順/ }).click();
	await page.getByRole("option", { name: "時間が早い順" }).click();
	await expect(markedCard).toHaveCount(1);

	// 内容が変わらない定期更新では、試合カードも結果の行も作り直さない
	await page.getByRole("button", { name: "再読み込み" }).click();
	await expect(page.locator(".view-panel:not([hidden]) .match")).toHaveCount(3);
	await expect(markedCard).toHaveCount(1);
	await expect(page.locator('.result-row[data-marker="kept"]')).toHaveCount(1);
});

test("results show today's record per tournament", async ({ page }) => {
	await page.clock.install({ time: new Date("2026-11-11T05:00:00.000Z") });
	await page.route("**/api/config", (route) =>
		route.fulfill({ json: { vapidPublicKey: "" } }),
	);
	await page.route("**/api/media?**", (route) =>
		route.fulfill({
			body: Buffer.from(pixel, "base64"),
			contentType: "image/png",
		}),
	);
	const today = "2026-11-11";
	const lost = {
		...completedDoublesLoss,
		id: "today-loss",
		tournament: "A Open",
		tournamentDate: today,
	};
	await page.route("**/api/status", (route) =>
		route.fulfill({
			json: {
				checkedAt: "2026-11-11T05:00:00.000Z",
				matches: [
					{
						...singlesMatch,
						id: "b-next",
						tournament: "B Open",
						tournamentDate: today,
					},
					// 明日の試合は数えない
					{
						...secondSinglesMatch,
						id: "a-tomorrow",
						tournament: "A Open",
						tournamentDate: "2026-11-12",
					},
				],
				recentResults: [
					{
						...completedMatch,
						id: "today-win",
						tournament: "A Open",
						tournamentDate: today,
					},
					lost,
					{
						...completedMatch,
						id: "b-win",
						tournament: "B Open",
						tournamentDate: today,
					},
				],
				calendarCheckedAt: null,
				upcomingTournaments: [],
			},
		}),
	);
	await page.route("**/api/live", (route) =>
		route.fulfill({ json: { checkedAt: null, matches: [] } }),
	);
	await page.goto("/");
	await page.getByRole("tab", { name: /結果/ }).click();

	const records = page.locator(".today-records-list li");
	// 今日の試合が全部終わった大会は勝敗、終わっていない大会は残りの試合数
	await expect(records).toHaveText(["A Open1勝1敗", "B Open残り1試合"]);
	// 周りの文字と同じ大きさ・太さで、目立たせすぎない
	await expect(records.first()).toHaveCSS("font-weight", "400");
	await expect(page.locator(".today-records-heading")).toHaveText("今日の成績");
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

test("a failed first load shows a retry instead of loading forever", async ({
	page,
}) => {
	await preparePage(page);
	let failStatus = true;
	await page.route("**/api/status", (route) =>
		failStatus
			? route.fulfill({ status: 500, json: { error: "Internal server error" } })
			: route.fulfill({
					json: {
						checkedAt: "2026-07-18T09:00:00.000Z",
						matches: [singlesMatch],
					},
				}),
	);
	// 保存済みの試合情報がない初回訪問を再現する
	await page.evaluate(() => localStorage.clear());
	await page.reload();
	await expect(
		page.locator(".view-panel:not([hidden]) .match-list [role=alert]"),
	).toContainText("試合情報を取得できませんでした");
	await expect(page.locator("[aria-busy=true]")).toHaveCount(0);
	failStatus = false;
	await page
		.locator(".view-panel:not([hidden]) .match-list .empty-state-retry")
		.click();
	await expect(page.locator(".match")).toHaveCount(1);
});

test("Worker Previews show that notifications are unavailable", async ({
	page,
}) => {
	await preparePage(page);
	await page.route("**/api/config", (route) =>
		route.fulfill({
			json: { targetCountry: "JPN", notificationsAvailable: false },
		}),
	);
	await page.reload();
	await expect(page.locator("#notification-status")).toHaveText(
		"プレビューでは通知を使えません",
	);
	await expect(page.locator("#notification-toggle")).toBeDisabled();
	await expect(page.locator("#test-notification-button")).toBeDisabled();
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
