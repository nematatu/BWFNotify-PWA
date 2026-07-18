import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: { configPath: "./wrangler.jsonc" },
			miniflare: {
				bindings: {
					VAPID_PUBLIC_KEY: "test-public-key",
					VAPID_PRIVATE_KEY: "test-private-key",
					VAPID_SUBJECT: "mailto:test@example.com",
				},
			},
		}),
	],
	test: {
		include: ["integration/**/*.test.ts"],
	},
});
