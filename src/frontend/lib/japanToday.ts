import { type Accessor, createSignal, onCleanup } from "solid-js";
import { japanDateKey } from "./format";

/** 日付を確かめ直す間隔。日本時間の0時をまたいだら、表示中の「今日」を切り替える。 */
const CHECK_INTERVAL_MS = 60_000;

/**
 * 今日（日本時間）の日付を、日付が変わったら更新される値として返す。
 * 開いたまま0時をまたいだ場合と、翌朝に画面へ戻った場合（タイマーが止まっていた場合）に更新する。
 * コンポーネントの中で呼ぶ。
 */
export function createJapanToday(): Accessor<string> {
	const [today, setToday] = createSignal(japanDateKey());
	const update = () => setToday(japanDateKey());
	const timer = setInterval(update, CHECK_INTERVAL_MS);
	document.addEventListener("visibilitychange", update);
	onCleanup(() => {
		clearInterval(timer);
		document.removeEventListener("visibilitychange", update);
	});
	return today;
}
