const FMT_DATE_MEDIUM = new Intl.DateTimeFormat("ja-JP", {
	dateStyle: "medium",
});
const FMT_DATETIME = new Intl.DateTimeFormat("ja-JP", {
	month: "numeric",
	day: "numeric",
	hour: "2-digit",
	minute: "2-digit",
});

export function formatDate(value: string): string {
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? "時刻不明" : FMT_DATETIME.format(date);
}

export function formatMatchTime(value: string | undefined): string {
	if (!value) return "時刻未定";
	const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
		? `${value.replace(" ", "T")}Z`
		: value;
	const date = new Date(normalized);
	if (Number.isNaN(date.getTime())) return String(value);
	return FMT_DATETIME.format(date);
}

export function formatTournamentDate(value: string | undefined): string {
	if (!value) return "";
	const date = new Date(`${value}T00:00:00`);
	return Number.isNaN(date.getTime())
		? String(value)
		: FMT_DATE_MEDIUM.format(date);
}

export function playerInitial(value: string): string {
	const parts = value.trim().split(/\s+/);
	return parts.length > 1
		? parts.map((p) => p.at(0) || "").join("")
		: value.substring(0, 2);
}

export function teamLabel(
	team: { players?: { name: string }[] } | undefined,
): string {
	return team?.players?.map((p) => p.name).join(" / ") || "選手不明";
}

const ROUND_LABELS: Record<string, string> = {
	F: "決勝",
	SF: "準決勝",
	QF: "準々決勝",
	R16: "2回戦",
	R32: "1回戦",
	R64: "1回戦",
};

export function displayRound(value?: string): string {
	if (!value) return "";
	return ROUND_LABELS[value] || value;
}

export function displayCourt(value?: string): string {
	if (!value) return "";
	const m = value.match(/Court\s+(\d+)/i);
	return m ? `第${m[1]}コート` : value;
}

export function displayTournamentCategory(value?: string): string {
	if (!value) return "";
	return value.replace("HSBC BWF World Tour ", "");
}
