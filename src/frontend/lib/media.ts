export const safeHttpsUrl = (url: unknown) =>
	String(url || "").replace(/^http:\/\//, "https://");

/**
 * 表示サイズに合わせて縮小したBWF画像を取得するための変換指定。
 * BWFの画像配信（img.bwfbadminton.com）はURLの `/image/upload/` 直後に
 * 変換指定を置くと縮小版を返す。高解像度画面（2倍）でも粗くならない大きさにする。
 * 例: 選手写真 約84KB → 約5KB
 */
const BWF_IMAGE_TRANSFORMS = {
	/** 選手写真（最大72px表示）。顔の位置に合わせて正方形に切り抜く */
	photo: "c_fill,g_face,w_144,h_144,q_auto",
	/** 国旗（最大44px幅で表示） */
	flag: "c_limit,w_96,q_auto",
	/** 大会ロゴ（最大56px表示） */
	logo: "c_limit,w_112,q_auto",
} as const;

export type BwfImageKind = keyof typeof BWF_IMAGE_TRANSFORMS;

const BWF_IMAGE_HOST = "img.bwfbadminton.com";
const BWF_UPLOAD_PREFIX = "/image/upload/";
/** `t_xxx` や `c_fill,w_100` のように、すでに変換指定が付いている区切り */
const TRANSFORM_SEGMENT = /^[a-z]{1,3}_/;

/** BWFの画像URLに縮小指定を加える。対象外のURLはそのまま返す。 */
export function resizedBwfImageUrl(url: string, kind: BwfImageKind): string {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return url;
	}
	if (
		parsed.hostname !== BWF_IMAGE_HOST ||
		!parsed.pathname.startsWith(BWF_UPLOAD_PREFIX)
	) {
		return url;
	}
	const rest = parsed.pathname.slice(BWF_UPLOAD_PREFIX.length);
	if (TRANSFORM_SEGMENT.test(rest)) return url;

	parsed.pathname = `${BWF_UPLOAD_PREFIX}${BWF_IMAGE_TRANSFORMS[kind]}/${rest}`;
	return parsed.toString();
}

/**
 * BWFの画像はWorkerの `/api/media` を経由して表示する。
 * `kind` を指定すると、表示サイズに合わせて縮小した画像を取得する。
 */
export const proxiedImageUrl = (url: unknown, kind?: BwfImageKind) => {
	if (!url) return "";
	const httpsUrl = safeHttpsUrl(url);
	const source = kind ? resizedBwfImageUrl(httpsUrl, kind) : httpsUrl;
	return `/api/media?url=${encodeURIComponent(source)}`;
};
