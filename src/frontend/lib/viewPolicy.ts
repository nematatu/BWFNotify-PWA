import type { MatchSummary } from "../../type";

export type MainView = "live" | "scheduled" | "results" | "upcoming";

export function preferredInitialView(
	matches: MatchSummary[],
	resultCount: number,
	tournamentCount: number,
): MainView {
	if (matches.some((match) => match.eventType === "live")) return "live";
	if (matches.some((match) => match.eventType === "scheduled")) {
		return "scheduled";
	}
	if (resultCount > 0) return "results";
	if (tournamentCount > 0) return "upcoming";
	return "live";
}
