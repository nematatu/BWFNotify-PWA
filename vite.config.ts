import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

function pwaPlugin() {
	let isBuild = false;
	return {
		name: "pwa-plugin",
		configResolved(config) {
			isBuild = config.command === "build";
		},
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				if (req.url === "/pwa/sw.js") {
					res.setHeader("Content-Type", "application/javascript");
					res.end(`// Development Service Worker (No Caching, Push Support Only)
self.addEventListener("install", (event) => {
	event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches.keys()
			.then((names) => Promise.all(names.map((name) => caches.delete(name))))
			.then(() => self.clients.claim())
	);
});

// No fetch event listener, allowing all requests to bypass Service Worker cache.

self.addEventListener("push", (event) => {
	let payload = {
		title: "BWF Notify",
		body: "日本人選手の試合が始まりました",
		url: "/",
		tag: "bwf-live",
		image: undefined,
	};

	if (event.data) {
		try {
			payload = { ...payload, ...event.data.json() };
		} catch {
			payload.body = event.data.text();
		}
	}

	const mediaUrl = notificationMediaUrl(payload.image);
	event.waitUntil(
		self.registration.showNotification(payload.title, {
			body: payload.body,
			icon:
				mediaUrl ||
				notificationMediaUrl(payload.icon) ||
				"/pwa/icons/icon-192.png",
			badge: "/pwa/icons/icon-192.png",
			...(mediaUrl ? { image: mediaUrl } : {}),
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

function notificationMediaUrl(value) {
	try {
		const image = new URL(String(value));
		if (image.protocol !== "https:") {
			return null;
		}
		const proxy = new URL("/api/media", self.location.origin);
		proxy.searchParams.set("url", image.toString());
		return proxy.toString();
	} catch {
		return null;
	}
}`);
					return;
				}
				next();
			});
		},
		closeBundle() {
			if (!isBuild) return;
			const distDir = path.resolve(__dirname, "dist");
			const assetsDir = path.join(distDir, "assets");

			if (!fs.existsSync(assetsDir)) {
				console.error("Vite build assets directory not found!");
				return;
			}

			// Find compiled CSS and JS files in assets/
			const files = fs.readdirSync(assetsDir);
			const cssFile = files.find((f) => f.endsWith(".css"));
			const jsFile = files.find((f) => f.endsWith(".js"));

			if (!cssFile || !jsFile) {
				console.error("Vite build output is missing JS or CSS in assets!");
				return;
			}

			const cssUrl = `/assets/${cssFile}`;
			const jsUrl = `/assets/${jsFile}`;

			// Load source sw.js template
			const srcSwPath = path.resolve(__dirname, "src/frontend/pwa/sw.js");
			if (!fs.existsSync(srcSwPath)) {
				console.error(
					"Source Service Worker template not found at src/frontend/pwa/sw.js!",
				);
				return;
			}

			let swContent = fs.readFileSync(srcSwPath, "utf8");

			// Generate timestamp-based version
			const buildVersion = Date.now().toString();

			// Replace placeholders in sw.js
			swContent = swContent
				.replace("__CACHE_NAME__", `"bwfnotify-shell-v${buildVersion}"`)
				.replace(
					"__APP_SHELL__",
					JSON.stringify(
						[
							"/",
							cssUrl,
							jsUrl,
							"/view/shuttle.svg",
							"/pwa/manifest.webmanifest",
							"/pwa/icons/icon.svg",
							"/pwa/icons/icon-192.png",
							"/pwa/icons/icon-512.png",
						],
						null,
						2,
					),
				);

			// Write to dist/pwa/sw.js
			const distPwaDir = path.join(distDir, "pwa");
			fs.mkdirSync(distPwaDir, { recursive: true });
			fs.writeFileSync(path.join(distPwaDir, "sw.js"), swContent, "utf8");
			console.log(
				`[PWA Plugin] Generated dist/pwa/sw.js with version: v${buildVersion}`,
			);
		},
	};
}

export default defineConfig({
	build: {
		outDir: "dist",
		assetsDir: "assets",
		emptyOutDir: true,
	},
	server: {
		proxy: {
			"/api": "http://127.0.0.1:8787",
		},
	},
	plugins: [solidPlugin(), pwaPlugin()],
});
