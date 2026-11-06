import { describe, expect, test } from "bun:test";
import {
	readCachedStatus,
	writeCachedStatus,
} from "../src/frontend/lib/statusCache";
import type { PublicState } from "../src/type";

function memoryStorage() {
	const values = new Map<string, string>();
	return {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => {
			values.set(key, value);
		},
	};
}

const state: PublicState = {
	checkedAt: "2026-11-06T08:00:00.000Z",
	matches: [],
	recentResults: [],
	calendarCheckedAt: null,
	upcomingTournaments: [],
};

describe("saved match status for instant display", () => {
	test("returns the saved status on the next visit", () => {
		const storage = memoryStorage();
		writeCachedStatus(storage, state, 1_000);
		expect(readCachedStatus(storage, 2_000)).toEqual(state);
	});

	test("ignores a status saved more than a day ago", () => {
		const storage = memoryStorage();
		writeCachedStatus(storage, state, 0);
		expect(readCachedStatus(storage, 24 * 60 * 60 * 1000 + 1)).toBeNull();
	});

	test("treats broken or unavailable storage as no saved status", () => {
		const broken = memoryStorage();
		broken.setItem("bwf-status-cache-v1", "{not json");
		expect(readCachedStatus(broken)).toBeNull();
		expect(readCachedStatus(undefined)).toBeNull();
		const throwing = {
			getItem: () => {
				throw new Error("SecurityError");
			},
			setItem: () => {
				throw new Error("QuotaExceededError");
			},
		};
		expect(readCachedStatus(throwing)).toBeNull();
		expect(() => writeCachedStatus(throwing, state)).not.toThrow();
	});
});
