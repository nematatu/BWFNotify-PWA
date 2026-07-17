import { describe, expect, test } from "bun:test";
import {
	eventType,
	extractJapaneseMatches,
	parseHeadToHead,
} from "../src/api/bwf";
import { japanesePlayerName } from "../src/config/japanese-player-names";
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
	] as const)("classifies %o as %s", (match, expected) => {
		expect(eventType(match)).toBe(expected);
	});
});

describe("extractJapaneseMatches", () => {
	test("keeps live and scheduled matches involving Japanese players", () => {
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
			result.map(({ id, players, eventType, status }) => ({
				id,
				players,
				eventType,
				status,
			})),
		).toEqual([
			{
				id: "japan-live",
				players: ["Player A", "Player B"],
				eventType: "live",
				status: "P",
			},
			{
				id: "japan-scheduled",
				players: ["Player C", "Player D"],
				eventType: "scheduled",
				status: "",
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
			},
		])[0];

		expect(result?.players).toEqual(["山口茜", "Player A"]);
		expect(result?.teams[0]?.countryCode).toBe("JPN");
	});

	test("builds the official tournament day link and preserves media", () => {
		const result = extractJapaneseMatches([
			{
				id: "media",
				tournamentName: "Japan Open",
				tournamentLogoUrl: "https://img.bwfbadminton.com/logo.png",
				tournamentLink:
					"https://bwfworldtour.bwfbadminton.com/tournament/5213/daihatsu-japan-open-2026/results/",
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
		expect(result?.matchUrl).toBe(
			"https://bwfworldtour.bwfbadminton.com/tournament/5213/daihatsu-japan-open-2026/results/2026-07-18",
		);
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
