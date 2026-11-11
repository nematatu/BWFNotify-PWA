import { describe, expect, test } from "bun:test";
import { calendarMonths } from "../src/frontend/lib/calendar";

describe("calendar links", () => {
	const tournament = (id: string, startDate: string, endDate: string) => ({
		id,
		name: id,
		startDate,
		endDate,
	});
	const linkedSegments = (id: string) =>
		calendarMonths([chinaOpen, shortTail], "2026-07-01")[0].weeks.flatMap(
			(week) =>
				week.segments
					.filter((segment) => segment.tournament.id === id)
					.map((segment) => ({
						span: segment.span,
						showLinks: segment.showLinks,
					})),
		);
	// 7/21（火）〜7/26（日）: 日曜始まりの週で、最後の帯は日曜の1日だけになる
	const chinaOpen = tournament("china", "2026-07-21", "2026-07-26");
	// 7/4（土）〜7/5（日）: どの帯も2日以下
	const shortTail = tournament("short", "2026-07-04", "2026-07-05");

	test("puts the links on the last segment that is long enough to fit them", () => {
		expect(linkedSegments("china")).toEqual([
			{ span: 5, showLinks: true },
			{ span: 1, showLinks: false },
		]);
	});

	test("shows no links when every segment is too short", () => {
		expect(linkedSegments("short")).toEqual([
			{ span: 1, showLinks: false },
			{ span: 1, showLinks: false },
		]);
	});
});
