const DATE_FORMAT = new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium" });
const DATE_TIME_FORMAT = new Intl.DateTimeFormat("ja-JP", {
	month: "numeric",
	day: "numeric",
	hour: "2-digit",
	minute: "2-digit",
});
export const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

const ROUND_LABELS: Record<string, string> = {
	F: "決勝",
	Final: "決勝",
	SF: "準決勝",
	"Semi-finals": "準決勝",
	Semifinals: "準決勝",
	QF: "準々決勝",
	"Quarter-finals": "準々決勝",
	Quarterfinals: "準々決勝",
	R16: "ベスト16",
	"Round of 16": "ベスト16",
	R32: "ベスト32",
	"Round of 32": "ベスト32",
	R64: "ベスト64",
	"Round of 64": "ベスト64",
};

// --- 日付・時刻 ---

export const formatDate = (value: string) => {
	const date = new Date(value);
	return Number.isNaN(date.getTime())
		? "時刻不明"
		: DATE_TIME_FORMAT.format(date);
};

/** BWFの `YYYY-MM-DD HH:mm:ss`（UTC）とISO形式の両方を表示用に整形する。 */
export const formatMatchTime = (value: string | undefined) => {
	if (!value) return "時刻未定";
	const isBwfUtc = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value);
	const date = new Date(isBwfUtc ? `${value.replace(" ", "T")}Z` : value);
	return Number.isNaN(date.getTime()) ? value : DATE_TIME_FORMAT.format(date);
};

export const formatTournamentDate = (value: string | undefined) => {
	if (!value) return "";
	const date = new Date(`${value}T00:00:00`);
	return Number.isNaN(date.getTime()) ? value : DATE_FORMAT.format(date);
};

/** `2026-07-21` を `7月21日（火）` にする。 */
export function formatScheduleDate(value: string) {
	const [year, month, day] = value.split("-").map(Number);
	const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
	return `${month}月${day}日（${WEEKDAY_LABELS[weekday]}）`;
}

/** 日本時間の日付を `YYYY-MM-DD` で返す。 */
export function japanDateKey(date = new Date()) {
	const parts = new Intl.DateTimeFormat("en", {
		timeZone: "Asia/Tokyo",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(date);
	const part = (type: Intl.DateTimeFormatPartTypes) =>
		parts.find((item) => item.type === type)?.value || "";
	return `${part("year")}-${part("month")}-${part("day")}`;
}

// --- 選手・試合 ---

/** 写真がない選手の代替表示。姓名があれば頭文字、なければ先頭2文字。 */
export const playerInitial = (name: string) => {
	const words = name.trim().split(/\s+/);
	return words.length > 1
		? words.map((word) => word.at(0) || "").join("")
		: name.substring(0, 2);
};

export const teamLabel = (team: { players?: { name: string }[] } | undefined) =>
	team?.players?.map((player) => player.name).join(" / ") || "選手不明";

export const displayRound = (round?: string) =>
	round ? ROUND_LABELS[round] || round : "";

export const displayCourt = (court?: string) =>
	court ? court.replace(/Court\s+(\d+)/i, "第$1コート") : "";

export const displayTournamentCategory = (category?: string) =>
	category ? category.replace("HSBC BWF World Tour ", "") : "";

/** 各ゲームを `21-18 / 15-21` の形式で並べる。 */
export const previousGameScoreline = (
	games?: Array<{ team1: number; team2: number }> | null,
) =>
	Array.isArray(games)
		? games
				.filter(
					(game) =>
						Number.isFinite(game?.team1) && Number.isFinite(game?.team2),
				)
				.map((game) => `${game.team1}-${game.team2}`)
				.join(" / ")
		: "";
