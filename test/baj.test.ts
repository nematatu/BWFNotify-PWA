import { describe, expect, test } from "bun:test";
import { fetchUpcomingTournaments, parseTournamentPage } from "../src/api/baj";

const tournamentHtml = `
<li class="v-tournament__item">
	<div class="v-tournament__date">2026.7.21 - 2026.7.26</div>
	<span class="c-tag">BWF Super 1000</span>
	<h3 class="v-tournament__ttl">中国オープン2026</h3>
	<a class="v-tournament__links-link" href="https://bwfbadminton.com/tournament/1">大会サイト</a>
	<a class="v-tournament__links-link" href="/storage/conventions/china.pdf">参加者</a>
</li>`;

describe("BAJ tournament calendar", () => {
	test("parses tournament identity and dates from one listing page", async () => {
		await expect(
			parseTournamentPage(new Response(tournamentHtml)),
		).resolves.toEqual([
			{
				id: "2026-07-21:中国オープン2026",
				name: "中国オープン2026",
				category: "BWF Super 1000",
				startDate: "2026-07-21",
				endDate: "2026-07-26",
				bwfUrl: "https://bwfbadminton.com/tournament/1",
				bajUrl: "https://www.badminton.or.jp/storage/conventions/china.pdf",
			},
		]);
	});

	test("fetches six listing pages and preserves official source links", async () => {
		const requested: string[] = [];
		const fetcher = (async (input: RequestInfo | URL) => {
			requested.push(String(input));
			return new Response(tournamentHtml);
		}) as typeof fetch;

		const tournaments = await fetchUpcomingTournaments(
			new Date("2026-07-20T00:00:00Z"),
			fetcher,
		);

		expect(requested).toHaveLength(6);
		expect(tournaments).toEqual([
			{
				id: "2026-07-21:中国オープン2026",
				name: "中国オープン2026",
				startDate: "2026-07-21",
				endDate: "2026-07-26",
				grade: "Super 1000",
				bwfUrl: "https://bwfbadminton.com/tournament/1",
				bajUrl: "https://www.badminton.or.jp/storage/conventions/china.pdf",
			},
		]);
	});
});
