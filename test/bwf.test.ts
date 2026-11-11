import { describe, expect, test } from "bun:test";
import matchCenterTournaments from "../config/match-center-tournaments.json";
import {
	eventType,
	extractJapaneseMatches,
	parseHeadToHead,
	tournamentsForDates,
} from "../src/api/bwf";
import {
	japanesePlayerName,
	japanesePlayerRomanizedNames,
} from "../src/config/japanese-player-names";
import type { BwfMatch } from "../src/type";
import { adjacentDates } from "../src/utils";

describe("adjacentDates", () => {
	test("returns dates across a month boundary", () => {
		expect(adjacentDates("2026-06-01")).toEqual([
			"2026-05-31",
			"2026-06-01",
			"2026-06-02",
		]);
	});
});

describe("tournamentsForDates", () => {
	test("keeps manual match-center codes outside the generated calendar", async () => {
		const generatedCalendarSource = await Bun.file(
			new URL("../config/upcoming-tournaments.json", import.meta.url),
		).text();

		expect(generatedCalendarSource).not.toContain("matchCenterCode");
		expect(matchCenterTournaments.tournaments).toContainEqual({
			code: "F5C3AACA-CA45-47CE-A7B4-80B3A59329EB",
			name: "フィリピンインターナショナルチャレンジ2026",
			startDate: "2026-07-28",
			endDate: "2026-08-02",
		});
	});

	test("adds an active configured tournament missing from the live endpoint", () => {
		const tournaments = tournamentsForDates(
			{
				results: [
					{
						code: "97FF954D-0A47-498D-81D1-B9105D891B59",
						name: "YONEX Taipei Open 2026",
					},
				],
			},
			["2026-07-29", "2026-07-30", "2026-07-31"],
		);

		expect(tournaments).toContainEqual({
			code: "F5C3AACA-CA45-47CE-A7B4-80B3A59329EB",
			name: "フィリピンインターナショナルチャレンジ2026",
		});
	});

	test("does not duplicate a configured tournament already returned upstream", () => {
		const code = "F5C3AACA-CA45-47CE-A7B4-80B3A59329EB";
		const tournaments = tournamentsForDates(
			{ results: [{ code, name: "Philippine International Challenge 2026" }] },
			["2026-07-30"],
		);

		expect(
			tournaments.filter((tournament) => tournament.code === code),
		).toHaveLength(1);
	});
});

describe("eventType", () => {
	test.each([
		[{ id: "1", matchStatus: "P" }, "live"],
		[{ id: "1", matchStatusValue: "In Progress" }, "live"],
		[{ id: "1", matchStatusValue: "On court" }, "live"],
		[{ id: "1", matchStatus: "F" }, "completed"],
		[{ id: "1", matchStatusValue: "Scheduled" }, "scheduled"],
		// スコア上で既に決着がついている（2ゲーム先取）場合は、ステータスが進行中でも完了（completed）とみなす
		[
			{
				id: "1",
				matchStatus: "P",
				score: [
					{ set: 1, home: 21, away: 19 },
					{ set: 2, home: 21, away: 15 },
				],
			},
			"completed",
		],
		// スコア上で決着がついていない（1ゲーム先取したのみ）場合は、進行中ステータス通りにliveと判定する
		[
			{
				id: "1",
				matchStatus: "P",
				score: [{ set: 1, home: 21, away: 19 }],
			},
			"live",
		],
		// BWFが状態を「開始前」で返しても、得点が始まっていて決着していなければ進行中とみなす
		// （2026-11-11 熊本マスターズ R32、第3ゲーム開始前のインターバルで実際に起きた）
		[
			{
				id: "1",
				matchStatusValue: "Not Started",
				score: [
					{ set: 1, home: 21, away: 18 },
					{ set: 2, home: 18, away: 21 },
					{ set: 3, home: 0, away: 0 },
				],
			},
			"live",
		],
		[
			{
				id: "1",
				matchStatus: "N",
				score: [{ set: 1, home: 3, away: 1 }],
			},
			"live",
		],
		// 0-0 の第1ゲームだけなら、まだ開始前
		[
			{
				id: "1",
				matchStatus: "N",
				score: [{ set: 1, home: 0, away: 0 }],
			},
			"scheduled",
		],
		// 終了の状態が付いていれば、途中棄権などで決着していなくても完了とみなす
		[
			{
				id: "1",
				matchStatus: "F",
				score: [{ set: 1, home: 11, away: 5 }],
			},
			"completed",
		],
	] as const)("classifies %o as %s", (match, expected) => {
		expect(eventType(match)).toBe(expected);
	});
});

describe("extractJapaneseMatches", () => {
	test("keeps live, scheduled, and completed matches involving Japanese players", () => {
		const matches: BwfMatch[] = [
			{
				id: "japan-live",
				tournamentName: "Japan Open",
				matchStatus: "P",
				team1: {
					countryCode: "JPN",
					players: [{ nameDisplay: "Player A", countryCode: "JPN" }],
				},
				team2: {
					countryCode: "CHN",
					players: [{ nameDisplay: "Player B", countryCode: "CHN" }],
				},
			},
			{
				id: "japan-scheduled",
				tournamentName: "Japan Open",
				matchStatus: "N",
				matchTimeUtc: "2026-07-18T09:00:00Z",
				team1: {
					countryCode: "JPN",
					players: [{ nameDisplay: "Player C", countryCode: "JPN" }],
				},
				team2: {
					countryCode: "KOR",
					players: [{ nameDisplay: "Player D", countryCode: "KOR" }],
				},
			},
			{
				id: "other-live",
				matchStatus: "P",
				team1: { countryCode: "CHN", players: [] },
				team2: { countryCode: "KOR", players: [] },
			},
			{
				id: "japan-finished",
				matchStatus: "F",
				team1: { countryCode: "JPN", players: [] },
				team2: { countryCode: "KOR", players: [] },
			},
		];

		const result = extractJapaneseMatches(matches);
		expect(
			result.map(({ id, players, eventType }) => ({
				id,
				players,
				eventType,
			})),
		).toEqual([
			{
				id: "japan-live",
				players: ["Player A", "Player B"],
				eventType: "live",
			},
			{
				id: "japan-scheduled",
				players: ["Player C", "Player D"],
				eventType: "scheduled",
			},
			{
				id: "japan-finished",
				players: [],
				eventType: "completed",
			},
		]);
		expect(result[0]?.teams[0]?.players[0]).toEqual({
			id: undefined,
			name: "Player A",
			countryCode: "JPN",
			flagUrl: undefined,
			photoUrl: undefined,
			isJapanese: true,
		});
	});

	test("uses the configured Japanese player name", () => {
		const matches: BwfMatch[] = [
			{
				id: "localized",
				matchStatus: "N",
				team1: {
					countryCode: "JPN",
					players: [{ nameDisplay: "Akane YAMAGUCHI" }],
				},
				team2: {
					countryCode: "CHN",
					players: [{ nameDisplay: "Player B" }],
				},
			},
		];

		expect(extractJapaneseMatches(matches)[0]?.players).toEqual([
			"山口茜",
			"Player B",
		]);
	});

	test("always places the Japanese team first", () => {
		const result = extractJapaneseMatches([
			{
				id: "japanese-second",
				matchStatus: "N",
				team1: {
					countryCode: "CHN",
					players: [{ id: "1", nameDisplay: "Player A" }],
				},
				team2: {
					countryCode: "JPN",
					players: [{ id: "2", nameDisplay: "Akane YAMAGUCHI" }],
				},
				score: [
					{
						set: 1,
						home: 18,
						away: 21,
						serve: 2,
						lastPointWinner: 2,
					},
				],
			},
		])[0];

		expect(result?.players).toEqual(["山口茜", "Player A"]);
		expect(result?.teams[0]?.countryCode).toBe("JPN");
		expect(result?.scores).toEqual([
			{
				game: 1,
				team1: 21,
				team2: 18,
				servingTeam: 1,
				lastPointWinner: 1,
			},
		]);
	});

	test("preserves BWF media", () => {
		const result = extractJapaneseMatches([
			{
				id: "media",
				tournamentName: "Japan Open",
				tournamentLogoUrl: "https://img.bwfbadminton.com/logo.png",
				tournamentHeaderImageUrl: "https://img.bwfbadminton.com/header.jpg",
				tournamentHeaderImageMobileUrl:
					"https://img.bwfbadminton.com/header-mobile.jpg",
				tournamentCategory: "HSBC BWF World Tour Super 750",
				matchStatus: "N",
				matchTime: "2026-07-18 10:00:00",
				team1: {
					countryCode: "JPN",
					countryFlagUrl: "https://img.bwfbadminton.com/JPN.png",
					players: [
						{
							id: "88405",
							nameDisplay: "Akira KOGA",
							photoUrl: "https://img.bwfbadminton.com/88405.jpg",
						},
					],
				},
				team2: { countryCode: "CHN", players: [] },
			},
		])[0];

		expect(result?.tournamentLogoUrl).toBe(
			"https://img.bwfbadminton.com/logo.png",
		);
		expect(result?.tournamentHeaderImageUrl).toBe(
			"https://img.bwfbadminton.com/header.jpg",
		);
		expect(result?.tournamentHeaderImageMobileUrl).toBe(
			"https://img.bwfbadminton.com/header-mobile.jpg",
		);
		expect(result?.tournamentCategory).toBe("HSBC BWF World Tour Super 750");
		expect(result?.teams[0]?.players[0]).toMatchObject({
			id: "88405",
			name: "古賀輝",
			flagUrl: "https://img.bwfbadminton.com/JPN.png",
			photoUrl: "https://img.bwfbadminton.com/88405.jpg",
			isJapanese: true,
		});
	});
});

describe("Japanese player dictionary", () => {
	test.each([
		["Tomona HARIMA", "播摩朋奈"],
		["Miki KANEHIRO", "金廣美希"],
		["Aya TAMAKI", "玉木亜弥"],
		["Hina OSAWA", "大澤陽奈"],
		// BWFの表記どおり（名 + 大文字の姓）で引けること
		["Haruki KAWABE", "川邊悠陽"],
		["Kenta MATSUKAWA", "松川健大"],
		["Kenya MITSUHASHI", "三橋健也"],
		["Keiichiro MATSUI", "松居圭一郎"],
		["Tsubasa YOSHIDA", "吉田翼"],
		["Takuto GOTO", "後藤拓人"],
		["Shogo OGAWA", "小川翔悟"],
		["Minoru KOGA", "古賀穂"],
		["Hina AKECHI", "明地陽菜"],
		["Ririna HIRAMOTO", "平本梨々菜"],
		["Yuta WATANABE", "渡辺勇大"],
		["Maya TAGUCHI", "田口真彩"],
		["Kokona ISHIKAWA", "石川心菜"],
		["Riki TAKEI", "武井凜生"],
		["Yudai OKIMOTO", "沖本優大"],
		["Kakeru KUMAGAI", "熊谷翔"],
		["Hiroki NISHI", "西大輝"],
		["Hiroki OKAMURA", "岡村洋輝"],
		["Kyohei YAMASHITA", "山下恭平"],
		["Hinata SUZUKI", "鈴木陽向"],
		["Nao YAMAKITA", "山北奈緖"],
		["Nanako HARA", "原菜那子"],
		["Riko KIYOSE", "清瀬璃子"],
		["Rei MIYASHITA", "宮下怜"],
		["Momoha NIIMI", "新見桃芭"],
		["Mikoto AISO", "相磯美心"],
		["Riku HATANO", "秦野陸"],
		["Yuzuno WATANABE", "渡邉柚乃"],
		["Nozomi OKUHARA", "奥原希望"],
		["Natsuki NIDAIRA", "仁平菜月"],
		["Asuka TAKAHASHI", "髙橋明日香"],
		["Haruna KONISHI", "小西春七"],
		["Niina MATSUTA", "松田仁衣菜"],
		["Sayaka HIROTA", "廣田彩花"],
		["Ayako SAKURAMOTO", "櫻本絢子"],
		["Yumi TANABE", "田邉裕美"],
		["An UESUGI", "上杉杏"],
		["Mio KONEGAWA", "古根川美桜"],
		["Mao YAMAKITA", "山北眞緒"],
		["Miyu TAKAHASHI", "髙橋美優"],
		["Sumire NAKADE", "中出すみれ"],
		["Kosuke MASUMOTO", "増本康祐"],
		["Shuntaro MEZAKI", "目崎駿太郎"],
		["Yuta OKU", "奥優汰"],
		["Yudai NAGAFUCHI", "永渕雄大"],
		["Kota OGAWA", "小川航汰"],
		["Naoya KAWASHIMA", "川島直也"],
		["Keita YASUDA", "家壽多慶太"],
		["Nanami SOMEYA", "染谷菜々美"],
		["Shiori EBIHARA", "海老原詩織"],
		["Suzuki MIZUI", "水井寿々妃"],
		["Mihane ENDO", "遠藤美羽"],
	] as const)("maps %s to %s", (source, expected) => {
		expect(japanesePlayerName(source)).toBe(expected);
	});

	test("shows newly added players in Japanese in match data from BWF", () => {
		const [match] = extractJapaneseMatches([
			{
				id: "korea-ws",
				matchStatus: "N",
				team1: {
					countryCode: "JPN",
					players: [
						{ id: "1", nameDisplay: "Hina AKECHI", countryCode: "JPN" },
					],
				},
				team2: {
					countryCode: "KOR",
					players: [
						{ id: "2", nameDisplay: "AN Se Young", countryCode: "KOR" },
					],
				},
			},
		]);
		expect(match?.teams[0]?.players[0]?.name).toBe("明地陽菜");
		expect(match?.teams[1]?.players[0]?.name).toBe("AN Se Young");
	});

	test("keeps romanized aliases for upstream matching", () => {
		expect(japanesePlayerRomanizedNames("奈良岡功大")).toContain(
			"KODAI NARAOKA",
		);
	});
});

describe("parseHeadToHead", () => {
	test("extracts totals and the latest previous result", () => {
		expect(
			parseHeadToHead({
				stats: {
					team1: { totalWins: 1 },
					team2: { totalWins: 0 },
					totalMatches: 1,
				},
				matches: [
					{
						info: { roundName: "QF", matchTime: "2026-06-12T00:00:00" },
						result: { winner: 1 },
						progress: {
							games: [
								{ team1: 21, team2: 14 },
								{ team1: 21, team2: 18 },
							],
						},
						tournament: { name: "Australian Open 2026" },
						matchStartTime: { dateLocal: "2026-06-12" },
					},
				],
			}),
		).toEqual({
			team1Wins: 1,
			team2Wins: 0,
			totalMatches: 1,
			previous: {
				tournament: "Australian Open 2026",
				date: "2026-06-12",
				round: "QF",
				winner: 1,
				games: [
					{ team1: 21, team2: 14 },
					{ team1: 21, team2: 18 },
				],
			},
		});
	});

	test("aligns a previous result with the current Japanese-first order", () => {
		const result = parseHeadToHead(
			{
				stats: {
					team1: { totalWins: 0 },
					team2: { totalWins: 1 },
					totalMatches: 1,
				},
				matches: [
					{
						team1: {
							player1: { id: 10 },
							player2: { id: 11 },
						},
						team2: {
							player1: { id: 20 },
							player2: { id: 21 },
						},
						info: { roundName: "QF" },
						result: { winner: 1 },
						progress: { games: [{ team1: 21, team2: 14 }] },
						tournament: { name: "Previous Open" },
					},
				],
			},
			[
				["20", "21"],
				["10", "11"],
			],
		);

		expect(result?.previous).toMatchObject({
			winner: 2,
			games: [{ team1: 14, team2: 21 }],
		});
	});
});
