import { Match, Switch } from "solid-js";
import { loadStatus, statusFailed, statusLoaded } from "../lib/matchesState";

/**
 * 一覧が空のときの表示。試合情報がまだ届いていない間は「読み込み中」、
 * 取得に失敗して表示できる情報がないときは失敗と再取得ボタンを出し、
 * データが無いと誤って伝えないようにする。
 */
export function EmptyState(props: { class: string; message: string }) {
	return (
		<Switch>
			<Match when={statusLoaded()}>
				<p class={props.class}>{props.message}</p>
			</Match>
			<Match when={statusFailed()}>
				<div class={props.class} role="alert">
					<p>試合情報を取得できませんでした</p>
					<button type="button" class="empty-state-retry" onClick={loadStatus}>
						再読み込み
					</button>
				</div>
			</Match>
			<Match when={true}>
				<p class={props.class} role="status" aria-busy="true">
					読み込み中…
				</p>
			</Match>
		</Switch>
	);
}
