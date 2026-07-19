import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const rootDir = process.cwd();
const swPath = join(rootDir, "public/pwa/sw.js");
const htmlPath = join(rootDir, "public/index.html");
const appJsPath = join(rootDir, "public/view/app.js");

// 1. Read sw.js to find the current version
const swContent = readFileSync(swPath, "utf8");
const versionMatch = swContent.match(/bwfnotify-shell-v(\d+)/);

if (!versionMatch) {
	console.error("Could not find version pattern in sw.js");
	process.exit(1);
}

const currentVersion = Number.parseInt(versionMatch[1], 10);
const newVersion = currentVersion + 1;

console.log(`Bumping PWA version: v${currentVersion} -> v${newVersion}`);

// 2. Replace in sw.js
const newSwContent = swContent
	.replace(
		new RegExp(`bwfnotify-shell-v${currentVersion}`, "g"),
		`bwfnotify-shell-v${newVersion}`,
	)
	.replace(new RegExp(`\\?v=${currentVersion}`, "g"), `?v=${newVersion}`);
writeFileSync(swPath, newSwContent, "utf8");

// 3. Replace in index.html
const htmlContent = readFileSync(htmlPath, "utf8");
const newHtmlContent = htmlContent.replace(
	new RegExp(`\\?v=${currentVersion}`, "g"),
	`?v=${newVersion}`,
);
writeFileSync(htmlPath, newHtmlContent, "utf8");

// 4. Replace in app.js
const appJsContent = readFileSync(appJsPath, "utf8");
const newAppJsContent = appJsContent.replace(
	new RegExp(`\\?v=${currentVersion}`, "g"),
	`?v=${newVersion}`,
);
writeFileSync(appJsPath, newAppJsContent, "utf8");

console.log("Successfully updated all version strings!");
