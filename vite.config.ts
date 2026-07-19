import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

function pwaPlugin() {
	return {
		name: "pwa-plugin",
		closeBundle() {
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
