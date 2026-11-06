const userAgent = () => navigator.userAgent || "";

/** iPadOSはMacintoshを名乗るため、タッチ点数でも判定する。 */
export const isIosDevice = () =>
	/iPad|iPhone|iPod/.test(userAgent()) ||
	(/Macintosh/.test(userAgent()) && navigator.maxTouchPoints > 1);

export const isMobileBrowser = () =>
	/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
		userAgent(),
	);

/** X、Instagram、LINEなどのアプリ内ブラウザ。 */
export const isInAppBrowser = () =>
	/\b(Twitter|FBAV|Instagram|Line|IAB|FB_IAB|FBAN)\b/i.test(userAgent());

export const isGoogleApp = () => /\bGSA\//.test(userAgent());

/** ホーム画面から起動したPWAか。iOSは独自の `navigator.standalone` を使う。 */
export const isStandaloneDisplay = () =>
	window.matchMedia("(display-mode: standalone)").matches ||
	(window.navigator as { standalone?: boolean }).standalone === true;

export type NotificationToggleAction = "toggle" | "install" | "blocked";

/**
 * 通知トグルを押したときの動作。
 * iOS/iPadOSのWeb Pushはホーム画面版でのみ使えるため、まず追加方法を案内する。
 */
export const notificationToggleAction = (
	permission: NotificationPermission,
	isIos: boolean,
	isStandalone: boolean,
): NotificationToggleAction => {
	if (isIos && !isStandalone) return "install";
	if (permission === "denied") return "blocked";
	return "toggle";
};

/** VAPID公開鍵（Base64URL）を `applicationServerKey` 用のバイト列へ変換する。 */
export const base64UrlToBytes = (value: string) => {
	const padding = "=".repeat((4 - (value.length % 4)) % 4);
	const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
	return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
};
