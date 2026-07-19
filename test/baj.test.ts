import { describe, expect, test } from "bun:test";
import {
	calendarRefreshDue,
	extractBajPlayersFromItems,
	updateTournamentAvailability,
} from "../src/api/baj";

const item = (str: string, x: number, y: number) => ({ str, x, y });

describe("BAJ participant PDFs", () => {
	test("extracts participant names without staff names", () => {
		expect(
			extractBajPlayersFromItems([
				[
					item("参加者：", 130, 600),
					item("No.", 230, 600),
					item("所属", 367, 600),
					item("MS", 194, 580),
					item("1", 237, 580),
					item("奈良岡", 254, 580),
					item("功大", 289, 580),
					item("NTT東日本", 367, 580),
					item("スタッフ：", 130, 200),
					item("監督", 254, 180),
				],
			]),
		).toEqual(["奈良岡功大"]);
	});

	test("extracts only rows after the dispatch player heading", () => {
		expect(
			extractBajPlayersFromItems([
				[
					item("監督", 90, 600),
					item("大堀", 160, 600),
					item("均", 193, 600),
					item("選", 95, 480),
					item("手", 116, 480),
					item("山口", 161, 460),
					item("茜", 193, 460),
					item("熊本県", 244, 460),
					item("以", 487, 140),
					item("上", 519, 140),
				],
			]),
		).toEqual(["山口茜"]);
	});
});

describe("BAJ refresh policy", () => {
	const checkedAt = "2026-07-20T00:00:00.000Z";
	test("does not refresh before 12 hours", () => {
		expect(
			calendarRefreshDue(checkedAt, new Date("2026-07-20T11:59:59Z")),
		).toBe(false);
	});

	test("refreshes after 12 hours", () => {
		expect(
			calendarRefreshDue(checkedAt, new Date("2026-07-20T12:00:00Z")),
		).toBe(true);
	});
});

describe("upcoming tournament status", () => {
	test("matches Japanese and English tournament data by date and participant", () => {
		const [tournament] = updateTournamentAvailability(
			[
				{
					id: "china",
					name: "中国オープン2026",
					startDate: "2026-07-21",
					endDate: "2026-07-26",
					participantSourceUrls: [],
					japanesePlayers: ["山口茜"],
					matchDataAvailable: false,
					timetableAvailable: false,
				},
			],
			[
				{
					id: "match",
					tournament: "VICTOR China Open 2026",
					youtubeUrl: "",
					players: ["山口茜", "Opponent"],
					teams: [
						{ players: [{ name: "山口茜", isJapanese: true }] },
						{ players: [{ name: "Opponent", isJapanese: false }] },
					],
					scores: [],
					eventType: "scheduled",
					tournamentDate: "2026-07-21",
					startTime: "2026-07-21T01:00:00Z",
				},
			],
		);
		expect(tournament).toMatchObject({
			matchDataAvailable: true,
			timetableAvailable: true,
		});
	});
});
