export type JsonObject = Record<string, unknown>;

export function object(value: unknown): JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as JsonObject)
		: {};
}

export function array(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

export function optionalString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function todayJst(now: Date = new Date()): string {
	return new Date(now.getTime() + 9 * 60 * 60 * 1000)
		.toISOString()
		.slice(0, 10);
}

export function adjacentDates(date: string): string[] {
	const base = Date.parse(`${date}T00:00:00Z`);
	if (!Number.isFinite(base)) {
		throw new Error(`Invalid date: ${date}`);
	}

	return [-1, 0, 1].map((offset) =>
		new Date(base + offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
	);
}

export function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
