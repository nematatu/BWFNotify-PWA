import { describe, expect, test } from "bun:test";
import {
	resolveYoutubeMatchUrl,
	resolveYoutubeStreamUrls,
	validYoutubeUrl,
} from "../src/api/youtube";
import {
	metadataMatchesSource,
	titleMatchesMatch,
} from "../src/api/youtubeMatch";
import { youtubeStreamSourcesFor } from "../src/config/youtube-stream-sources";
import type { MatchSummary } from "../src/type";

const liveMatch: MatchSummary = {
	id: "live",
	tournament: "DAIHATSU Japan Open 2026",
	tournamentCategory: "HSBC BWF World Tour Super 750",
	tournamentDate: "2026-07-18",
	youtubeUrl: "",
	players: ["奈良岡功大", "Christo POPOV"],
	teams: [
		{
			countryCode: "JPN",
			players: [{ name: "奈良岡功大", isJapanese: true }],
		},
		{
			countryCode: "FRA",
			players: [{ name: "Christo POPOV", isJapanese: false }],
		},
	],
	scores: [],
	eventType: "live",
	round: "SF",
	court: "Court 1",
};

describe("YouTube matching domain", () => {
	test("matches title and official source without network access", () => {
		const source = youtubeStreamSourcesFor(
			liveMatch.tournament,
			liveMatch.tournamentCategory,
		)[0];
		expect(source).toBeDefined();
		if (!source) throw new Error("Japan Open stream source is missing");
		expect(
			titleMatchesMatch(
				"DAIHATSU Japan Open 2026 | Christo Popov vs Kodai Naraoka | SF",
				liveMatch,
			),
		).toBe(true);
		expect(
			metadataMatchesSource(
				{
					title: "DAIHATSU Japan Open 2026",
					author_url: "https://www.youtube.com/@BWF",
				},
				source,
			),
		).toBe(true);
	});
});

describe("resolveYoutubeMatchUrl", () => {
	test("uses a verified direct YouTube URL when available", () => {
		expect(
			resolveYoutubeMatchUrl(
				{ tournament: "Japan Open", players: [] },
				"https://youtu.be/abcdefghijk",
			),
		).toBe("https://youtu.be/abcdefghijk");
	});

	test("does not manufacture a search link when no stream is verified", () => {
		expect(
			resolveYoutubeMatchUrl({
				tournament: "DAIHATSU Japan Open 2026",
				players: ["山口茜", "AN Se Young"],
			}),
		).toBe("");
	});

	test("rejects non-YouTube direct URLs", () => {
		expect(
			validYoutubeUrl("https://example.com/watch?v=abcdefghijk"),
		).toBeNull();
		expect(
			validYoutubeUrl("https://www.youtube.com/results?search_query=match"),
		).toBeNull();
	});

	test("reuses a verified URL without another YouTube request", async () => {
		let requested = false;
		const result = await resolveYoutubeStreamUrls(
			[
				{
					...liveMatch,
					youtubeUrl: "https://www.youtube.com/watch?v=7k7A0Wqfsr0",
				},
			],
			async () => {
				requested = true;
				return new Response();
			},
		);

		expect(requested).toBe(false);
		expect(result[0]?.youtubeUrl).toBe(
			"https://www.youtube.com/watch?v=7k7A0Wqfsr0",
		);
	});

	test("matches an official BWF stream by both teams", async () => {
		const result = await resolveYoutubeStreamUrls(
			[liveMatch],
			async (input) => {
				const url = String(input);
				return url.includes("oembed")
					? Response.json({
							title:
								"DAIHATSU Japan Open 2026 | Christo Popov (FRA) vs Kodai Naraoka (JPN) | SF",
							author_name: "BWF TV",
							author_url: "https://www.youtube.com/@BWF",
						})
					: new Response('"videoId":"7k7A0Wqfsr0"');
			},
		);

		expect(result[0]?.youtubeUrl).toBe(
			"https://www.youtube.com/watch?v=7k7A0Wqfsr0",
		);
	});

	test("matches an official regional stream by local date and court", async () => {
		const regionalMatch: MatchSummary = {
			...liveMatch,
			id: "regional",
			tournament: "YONEX Northern Marianas Open 2026",
			tournamentCategory: "International Challenge",
			tournamentDate: "2026-07-18",
			court: "1 - Streaming",
			eventType: "scheduled",
		};
		const result = await resolveYoutubeStreamUrls(
			[regionalMatch],
			async (input) =>
				String(input).includes("oembed")
					? Response.json({
							title: "YONEX Northern Marianas Open 2026 - 18 July - Court 1",
							author_name: "Badminton Oceania",
							author_url: "https://www.youtube.com/@BadmintonOceaniaTV",
						})
					: new Response('"videoId":"regional123"'),
		);

		expect(result[0]?.youtubeUrl).toBe(
			"https://www.youtube.com/watch?v=regional123",
		);
	});

	test("rejects another date, court, players, or unofficial channel", async () => {
		const result = await resolveYoutubeStreamUrls([liveMatch], async (input) =>
			String(input).includes("oembed")
				? Response.json({
						title: "DAIHATSU Japan Open 2026 - 17 July - Court 2",
						author_name: "Unofficial Live Score",
						author_url: "https://www.youtube.com/@unofficial",
					})
				: new Response('"videoId":"wrong123456"'),
		);

		expect(result[0]?.youtubeUrl).toBe("");
	});

	test("does not confuse Court 1 with Court 10", async () => {
		const result = await resolveYoutubeStreamUrls(
			[{ ...liveMatch, eventType: "scheduled" }],
			async (input) =>
				String(input).includes("oembed")
					? Response.json({
							title: "DAIHATSU Japan Open 2026 - 18 July - Court 10",
							author_url: "https://www.youtube.com/@BWF",
						})
					: new Response('"videoId":"wrong123456"'),
		);

		expect(result[0]?.youtubeUrl).toBe("");
	});

	test("does not treat missing team data as a player-name match", async () => {
		const result = await resolveYoutubeStreamUrls(
			[
				{
					...liveMatch,
					teams: [],
					tournamentDate: undefined,
					court: undefined,
				},
			],
			async (input) =>
				String(input).includes("oembed")
					? Response.json({
							title:
								"DAIHATSU Japan Open 2026 | Other Player vs Another Player",
							author_url: "https://www.youtube.com/@BWF",
						})
					: new Response('"videoId":"wrong123456"'),
		);

		expect(result[0]?.youtubeUrl).toBe("");
	});

	test("does not request YouTube for an unconfigured tournament", async () => {
		let requested = false;
		const result = await resolveYoutubeStreamUrls(
			[
				{
					...liveMatch,
					tournament: "Unstreamed Local Open",
					tournamentCategory: "Local Series",
				},
			],
			async () => {
				requested = true;
				return new Response();
			},
		);
		expect(requested).toBe(false);
		expect(result[0]?.youtubeUrl).toBe("");
	});
});
