import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: false,
	retries: 0,
	reporter: "line",
	use: {
		baseURL: "http://127.0.0.1:8793",
		screenshot: "only-on-failure",
		trace: "retain-on-failure",
	},
	webServer: {
		command:
			"WRANGLER_LOG_PATH=.wrangler/logs bunx wrangler dev --port 8793 --test-scheduled --persist-to /tmp/bwfnotify-layout-test",
		url: "http://127.0.0.1:8793",
		reuseExistingServer: false,
		timeout: 30_000,
	},
});
