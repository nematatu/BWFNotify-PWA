import { afterEach, describe, expect, test } from "bun:test";
import { fetchJapaneseMatches } from "../src/api/bwf";

const TOURNAMENTS = [
	"11111111-1111-1111-1111-111111111111",
	"22222222-2222-2222-2222-222222222222",
];
const DATES = ["2020-01-01", "2020-01-02", "2020-01-03"];

/** 大会コードと日付から、日本人選手の終了済み試合を1件作る。 */
function dayMatch(code: string, date: string) {
	return {
		id: `${code.slice(0, 1)}-${date}`,
		matchStatus: "F",
		team1: {
			countryCode: "JPN",
			players: [{ nameDisplay: "Player A", countryCode: "JPN" }],
		},
		team2: {
			countryCode: "KOR",
			players: [{ nameDisplay: "Player B", countryCode: "KOR" }],
		},
	};
}

/**
 * BWFの代わりに応答するfetch。日別の取得は少し待ってから返し、
 * 同時に何件の取得が進んでいたかを数える。
 */
function fakeBwf(options: { failing?: (url: URL) => boolean } = {}) {
	let inFlight = 0;
	let maxInFlight = 0;
	const fetch = async (input: string | URL | Request) => {
		const url = new URL(input instanceof Request ? input.url : input);
		if (url.pathname.endsWith("vue-current-live")) {
			return Response.json({
				results: TOURNAMENTS.map((code) => ({ code, name: code })),
			});
		}
		inFlight += 1;
		maxInFlight = Math.max(maxInFlight, inFlight);
		await new Promise((resolve) => setTimeout(resolve, 20));
		inFlight -= 1;
		if (options.failing?.(url)) {
			return new Response("error", { status: 500 });
		}
		const code = url.searchParams.get("tournamentCode") || "";
		const date = url.searchParams.get("date") || "";
		return Response.json([dayMatch(code, date)]);
	};
	return {
		fetch: fetch as unknown as typeof globalThis.fetch,
		maxInFlight: () => maxInFlight,
	};
}

describe("fetchJapaneseMatches", () => {
	const originalFetch = globalThis.fetch;
	const originalError = console.error;
	afterEach(() => {
		globalThis.fetch = originalFetch;
		console.error = originalError;
	});

	test("大会×日付の取得を同時に行い、すべての試合を返す", async () => {
		const bwf = fakeBwf();
		globalThis.fetch = bwf.fetch;

		const matches = await fetchJapaneseMatches(undefined, [], {
			dates: DATES,
		});

		expect(bwf.maxInFlight()).toBe(TOURNAMENTS.length * DATES.length);
		expect(matches.map((match) => match.id).sort()).toEqual(
			TOURNAMENTS.flatMap((code) =>
				DATES.map((date) => `${code.slice(0, 1)}-${date}`),
			).sort(),
		);
	});

	test("一部の取得に失敗しても、取得できた試合は返す", async () => {
		console.error = () => {};
		globalThis.fetch = fakeBwf({
			failing: (url) => url.searchParams.get("date") === DATES[1],
		}).fetch;

		const matches = await fetchJapaneseMatches(undefined, [], {
			dates: DATES,
		});

		expect(matches).toHaveLength(TOURNAMENTS.length * (DATES.length - 1));
		expect(matches.some((match) => match.id.endsWith(DATES[1]))).toBe(false);
	});

	test("すべての取得に失敗したら例外にする", async () => {
		console.error = () => {};
		globalThis.fetch = fakeBwf({ failing: () => true }).fetch;

		await expect(
			fetchJapaneseMatches(undefined, [], { dates: DATES }),
		).rejects.toThrow("BWF day matches are unavailable");
	});
});
