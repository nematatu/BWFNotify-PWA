const CACHE_NAME = "bwfnotify-shell-v2";
const APP_SHELL = [
	"/",
	"/app.css",
	"/app.js",
	"/manifest.webmanifest",
	"/icons/icon.svg",
	"/icons/icon-192.png",
	"/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then((cache) => cache.addAll(APP_SHELL))
			.then(() => self.skipWaiting()),
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((names) =>
				Promise.all(
					names
						.filter((name) => name !== CACHE_NAME)
						.map((name) => caches.delete(name)),
				),
			)
			.then(() => self.clients.claim()),
	);
});

self.addEventListener("fetch", (event) => {
	const url = new URL(event.request.url);
	if (
		event.request.method !== "GET" ||
		url.origin !== self.location.origin ||
		url.pathname.startsWith("/api/")
	) {
		return;
	}

	if (event.request.mode === "navigate") {
		event.respondWith(
			fetch(event.request).catch(() =>
				caches.match("/").then(requiredResponse),
			),
		);
		return;
	}

	event.respondWith(
		caches
			.match(event.request)
			.then((cached) => cached || fetch(event.request)),
	);
});

self.addEventListener("push", (event) => {
	let payload = {
		title: "BWF Notify",
		body: "日本人選手の試合が始まりました",
		url: "/",
		tag: "bwf-live",
	};

	if (event.data) {
		try {
			payload = { ...payload, ...event.data.json() };
		} catch {
			payload.body = event.data.text();
		}
	}

	event.waitUntil(
		self.registration.showNotification(payload.title, {
			body: payload.body,
			icon: "/icons/icon-192.png",
			badge: "/icons/icon-192.png",
			tag: payload.tag,
			data: { url: payload.url || "/" },
		}),
	);
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const targetUrl = new URL(
		event.notification.data?.url || "/",
		self.location.origin,
	).href;

	event.waitUntil(
		self.clients
			.matchAll({ type: "window", includeUncontrolled: true })
			.then((clients) => {
				const existing = clients.find((client) => client.url === targetUrl);
				return existing ? existing.focus() : self.clients.openWindow(targetUrl);
			}),
	);
});

function requiredResponse(response) {
	if (!response) {
		throw new Error("Cached app shell is unavailable");
	}
	return response;
}
