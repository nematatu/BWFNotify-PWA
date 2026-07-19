import { describe, expect, test } from "bun:test";
import {
	extractBajPlayersFromItems,
	fetchUpcomingTournaments,
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
	test("reuses players without refetching unchanged PDFs", async () => {
		const pdfUrl = "https://www.badminton.or.jp/storage/players.pdf";
		const requested: string[] = [];
		const html = `<li class="v-tournament__item">
			<div class="v-tournament__date">2026.7.21 - 2026.7.26</div>
			<span class="c-tag">BWF Super 1000</span>
			<h3 class="v-tournament__ttl">中国オープン2026</h3>
			<a class="v-tournament__links-link" href="https://bwfbadminton.com/tournament/1">大会サイト</a>
			<a class="v-tournament__links-link" href="${pdfUrl}">参加者</a>
		</li>`;
		const fetcher = (async (input: RequestInfo | URL) => {
			requested.push(String(input));
			return new Response(html);
		}) as typeof fetch;

		const tournaments = await fetchUpcomingTournaments(
			new Date("2026-07-20T00:00:00Z"),
			[
				{
					id: "2026-07-21:中国オープン2026",
					name: "中国オープン2026",
					category: "BWF Super 1000",
					startDate: "2026-07-21",
					endDate: "2026-07-26",
					officialUrl: "https://bwfbadminton.com/tournament/1",
					participantSourceUrls: [pdfUrl],
					japanesePlayers: ["山口茜"],
					matchDataAvailable: false,
					timetableAvailable: false,
				},
			],
			[],
			fetcher,
		);

		expect(requested).toHaveLength(6);
		expect(requested).not.toContain(pdfUrl);
		expect(tournaments[0]?.japanesePlayers).toEqual(["山口茜"]);
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
