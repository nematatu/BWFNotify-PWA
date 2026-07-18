import { describe, expect, test } from "bun:test";
import { resolveYoutubeMatchUrl, validYoutubeUrl } from "../src/api/youtube";

describe("resolveYoutubeMatchUrl", () => {
	test("uses a verified direct YouTube URL when available", () => {
		expect(
			resolveYoutubeMatchUrl(
				{ tournament: "Japan Open", players: [] },
				"https://youtu.be/abcdefghijk",
			),
		).toBe("https://youtu.be/abcdefghijk");
	});

	test("builds a specific YouTube search from match data", () => {
		const url = new URL(
			resolveYoutubeMatchUrl({
				tournament: "DAIHATSU Japan Open 2026",
				players: ["山口茜", "AN Se Young"],
				court: "Court 1",
				startTime: "2026-07-18 05:50:00",
			}),
		);
		expect(url.hostname).toBe("www.youtube.com");
		expect(url.searchParams.get("search_query")).toContain(
			"DAIHATSU Japan Open 2026",
		);
		expect(url.searchParams.get("search_query")).toContain("Court 1");
		expect(url.searchParams.get("search_query")).toContain("BWF TV");
	});

	test("rejects non-YouTube direct URLs", () => {
		expect(
			validYoutubeUrl("https://example.com/watch?v=abcdefghijk"),
		).toBeNull();
	});
});
