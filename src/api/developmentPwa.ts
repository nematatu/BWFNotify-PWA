export const PWA_CLEANUP_SERVICE_WORKER = `self.addEventListener("install", (event) => {
	event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
	event.waitUntil((async () => {
		const names = await caches.keys();
		await Promise.all(names.map((name) => caches.delete(name)));
		await self.registration.unregister();
	})());
});
`;

const CLEANUP_PAGE = `<!doctype html>
<html lang="ja">
<head><meta charset="utf-8"><title>開発用API</title></head>
<body>
<p>画面は <a href="http://localhost:5173/">localhost:5173</a> で開いてください。</p>
<script>
Promise.all([
	navigator.serviceWorker
		? navigator.serviceWorker.getRegistrations().then((items) =>
			Promise.all(items.map((item) => item.unregister())))
		: Promise.resolve(),
	caches.keys().then((names) => Promise.all(names.map((name) => caches.delete(name)))),
]).then(() => document.documentElement.setAttribute("data-pwa-cleanup", "done"));
</script>
</body>
</html>`;

export function developmentPwaResponse(request: Request): Response {
	const pathname = new URL(request.url).pathname;
	if (pathname === "/pwa/sw.js") {
		return new Response(PWA_CLEANUP_SERVICE_WORKER, {
			headers: {
				"Cache-Control": "no-store",
				"Content-Type": "application/javascript; charset=utf-8",
				"Service-Worker-Allowed": "/",
			},
		});
	}

	return new Response(CLEANUP_PAGE, {
		status: 410,
		headers: {
			"Cache-Control": "no-store",
			"Clear-Site-Data": '"cache", "storage"',
			"Content-Type": "text/html; charset=utf-8",
			"X-Content-Type-Options": "nosniff",
		},
	});
}
