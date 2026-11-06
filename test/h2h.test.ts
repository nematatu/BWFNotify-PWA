import { describe, expect, test } from "bun:test";
import { enrichWithHeadToHead } from "../src/api/bwfH2h";
import type { MatchSummary } from "../src/type";

/** expirationTtl も記録する、テスト用の最小限のKV。 */
function memoryKv() {
	const values = new Map<string, string>();
	const ttls = new Map<string, number | undefined>();
	const kv = {
		async get(key: string) {
			const value = values.get(key);
			return value === undefined ? null : JSON.parse(value);
		},
		async put(
			key: string,
			value: string,
			options?: { expirationTtl?: number },
		) {
			values.set(key, value);
			ttls.set(key, options?.expirationTtl);
		},
	};
	return { kv: kv as unknown as KVNamespace, values, ttls };
}

const match: MatchSummary = {
	id: "m1",
	tournament: "Korea Open",
	players: [],
	teams: [
		{ players: [{ id: "1", name: "日本選手", isJapanese: true }] },
		{ players: [{ id: "2", name: "Opponent", isJapanese: false }] },
	],
	scores: [],
	eventType: "scheduled",
};

const stats = {
	stats: {
		totalMatches: 3,
		team1: { totalWins: 2 },
		team2: { totalWins: 1 },
	},
	matches: [],
};

describe("head-to-head lookups", () => {
	test("stores a found record for 30 days and reuses it", async () => {
		const { kv, ttls } = memoryKv();
		let calls = 0;
		const fetchJson = async () => {
			calls += 1;
			return stats;
		};
		const [first] = await enrichWithHeadToHead([match], kv, [], fetchJson);
		const [second] = await enrichWithHeadToHead([match], kv, [], fetchJson);
		expect(first.h2h).toMatchObject({ team1Wins: 2, team2Wins: 1 });
		expect(second.h2h).toEqual(first.h2h);
		expect(calls).toBe(1);
		expect(ttls.get("bwf:h2h:v3:m1")).toBe(30 * 24 * 60 * 60);
	});

	test("does not ask BWF again for 6 hours when it returns no record", async () => {
		const { kv, ttls } = memoryKv();
		let calls = 0;
		const fetchJson = async () => {
			calls += 1;
			return {};
		};
		for (let run = 0; run < 3; run += 1) {
			const [result] = await enrichWithHeadToHead([match], kv, [], fetchJson);
			expect(result.h2h).toBeUndefined();
		}
		expect(calls).toBe(1);
		expect(ttls.get("bwf:h2h:v3:m1")).toBe(6 * 60 * 60);
	});

	test("backs off for 1 hour after a request error", async () => {
		const { kv, ttls } = memoryKv();
		let calls = 0;
		const fetchJson = async () => {
			calls += 1;
			throw new Error("BWF request failed with status 503");
		};
		await enrichWithHeadToHead([match], kv, [], fetchJson);
		const [result] = await enrichWithHeadToHead([match], kv, [], fetchJson);
		expect(result.h2h).toBeUndefined();
		expect(calls).toBe(1);
		expect(ttls.get("bwf:h2h:v3:m1")).toBe(60 * 60);
	});
});
