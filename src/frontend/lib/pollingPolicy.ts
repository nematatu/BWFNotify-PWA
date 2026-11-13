export type PollingMode = "paused" | "active" | "live";

/** この時間操作がなければ取得を止める。 */
export const IDLE_TIMEOUT_MS = 5 * 60_000;
/**
 * ライブ試合があるときの操作なしの上限。スマホで得点を眺めているだけの間は
 * 画面に触れないため、5分で止めると得点が止まったままになる。
 */
export const LIVE_IDLE_TIMEOUT_MS = 30 * 60_000;

export function pollingMode(input: {
	visible: boolean;
	idle: boolean;
	hasLiveMatches: boolean;
}): PollingMode {
	if (!input.visible || input.idle) return "paused";
	return input.hasLiveMatches ? "live" : "active";
}

/**
 * 最後の操作からの経過時間で、取得を止めるまでの残り時間を返す。
 * 0以下なら止める。ライブ試合がある間は上限を長くする。
 */
export function idleRemainingMs(input: {
	elapsedMs: number;
	hasLiveMatches: boolean;
}): number {
	const limit = input.hasLiveMatches ? LIVE_IDLE_TIMEOUT_MS : IDLE_TIMEOUT_MS;
	return limit - input.elapsedMs;
}
