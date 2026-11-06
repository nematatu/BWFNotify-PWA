import bwfCalendar from "../../config/bwf-calendar-2026.json";
import calendarSnapshot from "../../config/upcoming-tournaments.json";
import type { UpcomingTournament } from "../type";

/** BAJ大会情報の自動更新スクリプトが生成した時刻。 */
export const CALENDAR_GENERATED_AT = calendarSnapshot.generatedAt;

/**
 * BWF年間カレンダーへBAJ由来の大会情報を重ね、開始日順に返す。
 * 本番Workerでは外部へ取得せず、ビルド時に同梱した設定だけを使う。
 */
export function staticTournamentCalendar(): UpcomingTournament[] {
	const tournaments = new Map<string, UpcomingTournament>();
	for (const tournament of bwfCalendar.tournaments) {
		tournaments.set(tournament.id, tournament);
	}
	for (const tournament of calendarSnapshot.tournaments) {
		tournaments.set(tournament.id, {
			...tournaments.get(tournament.id),
			...tournament,
		});
	}
	return [...tournaments.values()].sort((left, right) =>
		left.startDate.localeCompare(right.startDate),
	);
}
