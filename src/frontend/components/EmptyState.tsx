import { Show } from "solid-js";
import { statusLoaded } from "../lib/matchesState";

/**
 * 一覧が空のときの表示。試合情報がまだ届いていない間は「読み込み中」を出し、
 * データが無いと誤って伝えないようにする。
 */
export function EmptyState(props: { class: string; message: string }) {
	return (
		<Show
			when={statusLoaded()}
			fallback={
				<p class={props.class} role="status" aria-busy="true">
					読み込み中…
				</p>
			}
		>
			<p class={props.class}>{props.message}</p>
		</Show>
	);
}
