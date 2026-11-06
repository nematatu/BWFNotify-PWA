import type { PublicState } from "../../type";

/**
 * 前回取得した試合情報（/api/status の応答）を端末に保存し、次に開いたときすぐ表示する。
 * 表示後に最新の情報を取得して置き換えるため、古い情報が残り続けることはない。
 */
const STATUS_CACHE_KEY = "bwf-status-cache-v1";
/** これより古い保存データは表示しない（大会や試合の状況が変わりすぎているため）。 */
const STATUS_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type StoredStatus = { savedAt: number; state: PublicState };

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

export function readCachedStatus(
	storage: Storage | undefined,
	now = Date.now(),
): PublicState | null {
	try {
		const raw = storage?.getItem(STATUS_CACHE_KEY);
		if (!raw) return null;
		const stored = JSON.parse(raw) as Partial<StoredStatus>;
		if (
			typeof stored.savedAt !== "number" ||
			now - stored.savedAt > STATUS_CACHE_MAX_AGE_MS ||
			!stored.state ||
			!Array.isArray(stored.state.matches)
		) {
			return null;
		}
		return stored.state;
	} catch {
		// 保存領域が使えない・壊れている場合は、保存データなしとして扱う
		return null;
	}
}

export function writeCachedStatus(
	storage: Storage | undefined,
	state: PublicState,
	now = Date.now(),
): void {
	try {
		storage?.setItem(
			STATUS_CACHE_KEY,
			JSON.stringify({ savedAt: now, state } satisfies StoredStatus),
		);
	} catch {
		// 容量不足やプライベートモードでは保存しない（表示には影響しない）
	}
}

/** ブラウザの localStorage。使えない環境では undefined。 */
export function browserStorage(): Storage | undefined {
	try {
		return typeof localStorage === "undefined" ? undefined : localStorage;
	} catch {
		return undefined;
	}
}
