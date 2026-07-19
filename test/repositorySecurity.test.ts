import { describe, expect, test } from "bun:test";

const trackedFiles = () => {
	const result = Bun.spawnSync(["git", "ls-files", "-z"]);
	if (result.exitCode !== 0) throw new Error("git ls-files failed");
	return result.stdout.toString().split("\0").filter(Boolean);
};

const textFile = async (path: string) => {
	const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
	if (bytes.includes(0)) return null;
	return new TextDecoder().decode(bytes);
};

describe("repository security", () => {
	test("does not track local secret files", () => {
		const forbidden = trackedFiles().filter(
			(path) =>
				path !== ".dev.vars.example" &&
				(/(^|\/)\.dev\.vars($|\.)/.test(path) ||
					/(^|\/)\.env($|\.)/.test(path) ||
					/\.(pem|p12|pfx)$/.test(path) ||
					/(^|\/)\.npmrc$/.test(path)),
		);
		expect(forbidden).toEqual([]);
	});

	test("does not contain recognizable private credentials", async () => {
		const secretPatterns = [
			/-----BEGIN [A-Z ]*PRIVATE KEY-----/,
			/\b(?:github_pat_|gh[pousr]_)[A-Za-z0-9_]{20,}/,
			/\bAKIA[A-Z0-9]{16}\b/,
			/\bAIza[A-Za-z0-9_-]{30,}\b/,
			/["']?\b(?:VAPID_PRIVATE_KEY|CLOUDFLARE_API_TOKEN|SPORTRADAR_BADMINTON_API_KEY)\b["']?\s*[:=]\s*["']?(?!YOUR_)[A-Za-z0-9._-]{20,}/,
		];
		const violations: string[] = [];
		for (const path of trackedFiles()) {
			if (!(await Bun.file(path).exists())) continue;
			const content = await textFile(path);
			if (content && secretPatterns.some((pattern) => pattern.test(content))) {
				violations.push(path);
			}
		}
		expect(violations).toEqual([]);
	});

	test("keeps development KV bindings detached from production IDs", async () => {
		const development = JSON.parse(await Bun.file("wrangler.dev.jsonc").text());
		expect(development.kv_namespaces).toEqual([
			{ binding: "NOTIFIED_MATCHES" },
		]);
	});
});
