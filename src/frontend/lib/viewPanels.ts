import { createEffect, createSignal } from "solid-js";
import { whenIdle } from "./browser";
import { currentView, type MainView, statusLoaded } from "./matchesState";

/**
 * タブの中身の単位。タブごとに別の画面を持つ。
 * 「ライブ」と「このあと」も別々に持ち、切り替えのたびに試合カードを作り直さない。
 */
export type Panel = MainView;

/** 空き時間に作っておく順番。よく開くタブから作る */
const PANELS: Panel[] = ["live", "scheduled", "results", "upcoming"];

/** 一度作ったタブ。作ったタブは捨てずに隠して使い回す。 */
const [mounted, setMounted] = createSignal<ReadonlySet<Panel>>(new Set());

const mount = (panels: Panel[]) => {
	if (panels.every((panel) => mounted().has(panel))) return;
	setMounted(new Set([...mounted(), ...panels]));
};

export const isPanelVisible = (panel: Panel) => currentView() === panel;

export const isPanelMounted = (panel: Panel) =>
	mounted().has(panel) || isPanelVisible(panel);

/**
 * 表示したタブを作ったものとして記録する。試合情報を表示できたら、
 * 残りのタブも空き時間に作っておき、初めて切り替えるときも待たせない。
 * コンポーネントの中で呼ぶ。
 */
export function trackViewPanels() {
	let prepared = false;
	createEffect(() => {
		mount([currentView()]);
		if (!prepared && statusLoaded()) {
			prepared = true;
			// 最初の画面を描き終えてから、1タブずつ空き時間に作る
			requestAnimationFrame(() => setTimeout(prepareNextPanel));
		}
	});
}

const prepareNextPanel = () => {
	const next = PANELS.find((panel) => !mounted().has(panel));
	if (!next) return;
	whenIdle(() => {
		mount([next]);
		prepareNextPanel();
	});
};
