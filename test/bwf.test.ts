import { describe, expect, test } from "bun:test";
import { eventType, extractJapaneseLiveMatches } from "../src/bwf";
import type { BwfMatch } from "../src/types";
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

describe("extractJapaneseLiveMatches", () => {
	test("keeps only live matches involving Japanese players", () => {
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

		expect(extractJapaneseLiveMatches(matches)).toEqual([
			{
				id: "japan-live",
				tournament: "Japan Open",
				players: ["Player A", "Player B"],
				status: "P",
				round: undefined,
				court: undefined,
				startTime: undefined,
			},
		]);
	});
});
