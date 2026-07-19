import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e-dev",
	fullyParallel: false,
	retries: 0,
	reporter: "line",
	use: {
		screenshot: "only-on-failure",
		trace: "retain-on-failure",
	},
	webServer: {
		command: "bun scripts/dev.mjs --skip-initial-sync",
		url: "http://localhost:5173",
		reuseExistingServer: true,
		timeout: 30_000,
	},
});
