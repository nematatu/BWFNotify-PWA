/**
 * 定期更新で届いた一覧のうち、内容が変わっていない項目は前回のオブジェクトを使い回す。
 * 画面の一覧（`For`）はオブジェクトが同じ項目を作り直さないため、
 * 変わった試合のカードだけが描き直される。何も変わっていなければ前回の配列をそのまま返す。
 */
export function reuseUnchanged<T extends { id: string }>(
	previous: readonly T[],
	next: readonly T[],
): T[] {
	const previousById = new Map(previous.map((item) => [item.id, item]));
	let changed = previous.length !== next.length;
	const result = next.map((item, index) => {
		const old = previousById.get(item.id);
		const kept = old && serialized(old) === serialized(item) ? old : item;
		if (kept !== previous[index]) changed = true;
		return kept;
	});
	return changed ? result : (previous as T[]);
}

const serializedCache = new WeakMap<object, string>();

function serialized(item: object): string {
	let value = serializedCache.get(item);
	if (value === undefined) {
		value = JSON.stringify(item);
		serializedCache.set(item, value);
	}
	return value;
}
