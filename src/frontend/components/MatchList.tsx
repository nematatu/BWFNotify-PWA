import { createMemo, For, Show } from "solid-js";
import type { MatchSummary } from "../../type";
import { proxiedImageUrl } from "../lib/media";
import { sortedMatches, tournamentGroups } from "../match-groups";
import { MatchCard } from "./MatchCard";

export function MatchList(props: {
	matches: MatchSummary[];
	sortOrder: string;
	view: "live" | "scheduled";
	excludedMatchIds: Set<string>;
	notificationDisabled: boolean;
	onNotificationChange: (matchId: string, enabled: boolean) => void;
}) {
	const sorted = createMemo(() =>
		sortedMatches(props.matches, props.sortOrder),
	);
	const grouped = createMemo(() => tournamentGroups(props.matches));
	const isTournamentView = () => props.sortOrder === "tournament";

	return (
		<div
			id="match-list"
			class={`match-list ${isTournamentView() ? "" : "time-grid"}`}
			role="tabpanel"
			aria-labelledby={`${props.view}-tab`}
			aria-live="polite"
		>
			<Show
				when={props.matches.length > 0}
				fallback={<p class="empty-state">対象の試合はありません</p>}
			>
				<Show
					when={isTournamentView()}
					fallback={
						<For each={sorted()}>
							{(match) => (
								<MatchCard
									match={match}
									showTournament={true}
									notificationEnabled={!props.excludedMatchIds.has(match.id)}
									notificationDisabled={props.notificationDisabled}
									onNotificationChange={props.onNotificationChange}
								/>
							)}
						</For>
					}
				>
					<For each={grouped()}>
						{(group) => (
							<div class="tournament-group">
								<div class="tournament-hero">
									<Show
										when={group.matches[0]?.tournamentHeaderImageUrl}
										fallback={
											<div class="tournament-hero-fallback">{group.name}</div>
										}
									>
										<img
											class="tournament-hero-image"
											src={proxiedImageUrl(
												group.matches[0].tournamentHeaderImageUrl,
											)}
											alt={group.name}
										/>
									</Show>
									<div class="tournament-hero-overlay">
										<h2>{group.name}</h2>
										<Show when={group.matches[0]?.tournamentCategory}>
											<p class="tournament-category">
												{group.matches[0].tournamentCategory}
											</p>
										</Show>
									</div>
								</div>
								<div class="tournament-matches">
									<For each={group.matches}>
										{(match) => (
											<MatchCard
												match={match}
												notificationEnabled={
													!props.excludedMatchIds.has(match.id)
												}
												notificationDisabled={props.notificationDisabled}
												onNotificationChange={props.onNotificationChange}
											/>
										)}
									</For>
								</div>
							</div>
						)}
					</For>
				</Show>
			</Show>
		</div>
	);
}
