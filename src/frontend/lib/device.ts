export function isIosDevice(): boolean {
	const ua = navigator.userAgent || "";
	return (
		/iPad|iPhone|iPod/.test(ua) ||
		(/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
	);
}

export function isMobileBrowser(): boolean {
	const ua = navigator.userAgent || "";
	return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
		ua,
	);
}

export function isInAppBrowser(): boolean {
	const ua = navigator.userAgent || "";
	return /\b(Twitter|FBAV|Instagram|Line|IAB|FB_IAB|FBAN)\b/i.test(ua);
}

export function isGoogleApp(): boolean {
	const ua = navigator.userAgent || "";
	return /\bGSA\//.test(ua);
}

export function isStandaloneDisplay(): boolean {
	return (
		window.matchMedia("(display-mode: standalone)").matches ||
		(window.navigator as unknown as { standalone?: boolean }).standalone ===
			true
	);
}
