export type PollingMode = "paused" | "active" | "live";

export function pollingMode(input: {
	visible: boolean;
	idle: boolean;
	hasLiveMatches: boolean;
}): PollingMode {
	if (!input.visible || input.idle) return "paused";
	return input.hasLiveMatches ? "live" : "active";
}
