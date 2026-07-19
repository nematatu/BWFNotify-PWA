const workerUrl = "http://127.0.0.1:8787";

const processes = [
	Bun.spawn(["bunx", "wrangler", "dev", "--test-scheduled"], {
		stdin: "inherit",
		stdout: "inherit",
		stderr: "inherit",
		env: { ...process.env, WRANGLER_LOG_PATH: ".wrangler/logs" },
	}),
	Bun.spawn(["bunx", "vite", "--strictPort"], {
		stdin: "inherit",
		stdout: "inherit",
		stderr: "inherit",
		env: process.env,
	}),
];

let stopping = false;

async function stopAll(exitCode) {
	if (stopping) return;
	stopping = true;
	for (const child of processes) {
		if (child.exitCode == null) child.kill();
	}
	await Promise.allSettled(processes.map((child) => child.exited));
	process.exitCode = exitCode;
}

async function initializeWorker() {
	for (let attempt = 0; attempt < 30; attempt++) {
		try {
			const ready = await fetch(`${workerUrl}/api/config`);
			if (ready.ok) {
				const scheduled = await fetch(`${workerUrl}/__scheduled`);
				if (!scheduled.ok) {
					console.warn(`Initial scheduled run failed (${scheduled.status})`);
				}
				return;
			}
		} catch {
			// Worker startup is still in progress.
		}
		await Bun.sleep(500);
	}
	console.warn(
		"Worker did not become ready; initial scheduled run was skipped",
	);
}

process.once("SIGINT", () => void stopAll(130));
process.once("SIGTERM", () => void stopAll(143));
void initializeWorker();

const firstExitCode = await Promise.race(
	processes.map((child) => child.exited),
);
await stopAll(firstExitCode);
