import { For, Show } from "solid-js";
import type { MatchPlayerSummary, MatchTeamSummary } from "../../type";
import { playerInitial } from "../lib/format";
import { proxiedImageUrl } from "../lib/media";

export function TeamBlock(props: {
	team: MatchTeamSummary | undefined;
	side: "left" | "right";
}) {
	const isJapanese = () => props.team?.players?.some((p) => p.isJapanese);

	return (
		<div
			class={`team team-${props.side} ${isJapanese() ? "japanese-team" : "foreign-team"}`}
		>
			<div class="team-identity">
				<Show
					when={props.team?.flagUrl}
					fallback={<div class="country-flag-fallback" />}
				>
					<img
						class="country-flag"
						src={proxiedImageUrl(props.team?.flagUrl)}
						alt={props.team?.countryCode || "国旗"}
					/>
				</Show>
				<div class="player-photos">
					<For each={props.team?.players || []}>
						{(player: MatchPlayerSummary) => (
							<Show
								when={player.photoUrl}
								fallback={
									<div class="player-photo player-photo-placeholder">
										{playerInitial(player.name)}
									</div>
								}
							>
								<img
									class="player-photo"
									src={proxiedImageUrl(player.photoUrl)}
									alt={player.name}
								/>
							</Show>
						)}
					</For>
				</div>
			</div>
			<div class="player-names">
				<For each={props.team?.players || []}>
					{(player: MatchPlayerSummary, index) => (
						<>
							<Show when={index() > 0}>
								<span class="player-separator"> / </span>
							</Show>
							<span
								class={`player-name ${player.isJapanese ? "japanese-player" : ""}`}
							>
								{player.name}
							</span>
						</>
					)}
				</For>
			</div>
		</div>
	);
}
