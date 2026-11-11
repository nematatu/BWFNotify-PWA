import { describe, expect, test } from "bun:test";
import { reuseUnchanged } from "../src/frontend/lib/stableItems";

describe("reuseUnchanged", () => {
	const a = { id: "a", score: 1 };
	const b = { id: "b", score: 2 };

	test("returns the previous array when nothing changed", () => {
		const previous = [a, b];
		const next = [
			{ id: "a", score: 1 },
			{ id: "b", score: 2 },
		];
		expect(reuseUnchanged(previous, next)).toBe(previous);
	});

	test("keeps unchanged items and replaces changed ones", () => {
		const changedB = { id: "b", score: 3 };
		const result = reuseUnchanged([a, b], [{ id: "a", score: 1 }, changedB]);
		expect(result[0]).toBe(a);
		expect(result[1]).toBe(changedB);
	});

	test("follows the new order, additions and removals", () => {
		const c = { id: "c", score: 0 };
		const result = reuseUnchanged([a, b], [c, { id: "a", score: 1 }]);
		expect(result).toEqual([c, a]);
		expect(result[1]).toBe(a);
	});
});
