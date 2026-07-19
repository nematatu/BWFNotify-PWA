import { describe, expect, test } from "bun:test";
import {
	eventType,
	extractJapaneseMatches,
	parseHeadToHead,
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

	test("builds a YouTube link and preserves BWF media", () => {
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
		expect(result?.youtubeUrl).toBe("");
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
	] as const)("maps %s to %s", (source, expected) => {
		expect(japanesePlayerName(source)).toBe(expected);
	});

	test("keeps romanized aliases for YouTube title matching", () => {
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
