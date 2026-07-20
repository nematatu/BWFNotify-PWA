import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";
import { PWA_CLEANUP_SERVICE_WORKER } from "./src/api/developmentPwa";

function pwaPlugin() {
	let isBuild = false;
	return {
		name: "pwa-plugin",
		configResolved(config) {
			isBuild = config.command === "build";
		},
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				const pathname = req.url?.split("?", 1)[0];
				if (pathname === "/pwa/sw.js") {
					res.setHeader("Content-Type", "application/javascript");
					res.setHeader("Cache-Control", "no-store");
					res.setHeader("Service-Worker-Allowed", "/");
					res.end(PWA_CLEANUP_SERVICE_WORKER);
					return;
				}
				if (pathname === "/pwa/manifest.webmanifest") {
					res.statusCode = 404;
					res.setHeader("Cache-Control", "no-store");
					res.setHeader("Content-Type", "text/plain; charset=utf-8");
					res.end("PWA is disabled during development");
					return;
				}
				next();
			});
		},
		transformIndexHtml(html) {
			if (!isBuild) return html;
			return {
				html,
				tags: [
					{
						tag: "meta",
						attrs: { name: "apple-mobile-web-app-capable", content: "yes" },
						injectTo: "head",
					},
					{
						tag: "meta",
						attrs: {
							name: "apple-mobile-web-app-status-bar-style",
							content: "black-translucent",
						},
						injectTo: "head",
					},
					{
						tag: "link",
						attrs: { rel: "manifest", href: "/pwa/manifest.webmanifest" },
						injectTo: "head",
					},
					{
						tag: "link",
						attrs: { rel: "apple-touch-icon", href: "/pwa/icons/icon-192.png" },
						injectTo: "head",
					},
				],
			};
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
							"/view/sources/bwf.svg",
							"/view/sources/baj.svg",
							"/view/tournaments/daihatsu-japan-open-2026.jpg",
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
