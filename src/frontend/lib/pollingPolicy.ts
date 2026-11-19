import type { MatchSummary } from "../../type";
import { parseMatchTime } from "./format";

/**
 * 取得モード。
 * - paused: 画面が見えていない間は取得しない
 * - idle: 見えているが操作がない間は、全体の情報だけをゆっくり取り直す
 * - active: 全体の情報を2分ごとに取る
 * - live: それに加えてライブ得点を15秒ごとに取る
 */
export type PollingMode = "paused" | "idle" | "active" | "live";

/**
 * 開始時刻を過ぎた「このあと」の試合について、ライブ得点を取りに行く期間。
 * 試合は予定より遅れて始まることが多いため、開始時刻から3時間までは待つ。
 */
export const START_WATCH_WINDOW_MS = 3 * 60 * 60_000;

/**
 * ライブ得点（/api/live）を取りに行く必要があるか。
 * ライブ中の試合に加え、開始時刻を過ぎた「このあと」の試合も対象にする。
 * 全体の更新（Cron 2分＋配信キャッシュ＋画面の2分ごとの取得）を待つと、
 * 試合が始まってから「ライブ」に移るまで最大4分半ほどかかるため。
 */
export function needsLiveScores(
	matches: MatchSummary[],
	nowMs: number,
): boolean {
	return matches.some((match) => {
		if (match.eventType === "live") return true;
		if (match.eventType !== "scheduled") return false;
		const start = parseMatchTime(match.startTime)?.getTime();
		return (
			start !== undefined &&
			start <= nowMs &&
			nowMs - start <= START_WATCH_WINDOW_MS
		);
	});
}

/** 次に開始時刻を迎える「このあと」の試合までの時間。なければ undefined。 */
export function msUntilNextStart(
	matches: MatchSummary[],
	nowMs: number,
): number | undefined {
	let next: number | undefined;
	for (const match of matches) {
		if (match.eventType !== "scheduled") continue;
		const start = parseMatchTime(match.startTime)?.getTime();
		if (start === undefined || start <= nowMs) continue;
		const delay = start - nowMs;
		if (next === undefined || delay < next) next = delay;
	}
	return next;
}

/**
 * 操作がない間（idle）に全体の情報を取り直す間隔。
 * 閉じ忘れた画面でも、表示が10分より古くならないようにする。配信キャッシュがあるため負荷は小さい。
 */
export const IDLE_POLL_MS = 10 * 60_000;

/** この時間操作がなければ、取得をゆっくりにする（idle）。 */
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
	if (!input.visible) return "paused";
	// 操作がなくても見えている間は止めない。画面を開いたまま眺めているだけで
	// 「更新」の時刻が古いまま止まってしまうため
	if (input.idle) return "idle";
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
