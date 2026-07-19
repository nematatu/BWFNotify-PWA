import type { MatchSummary } from "../../type";

// ==========================================
// 1. API Helper
// ==========================================
const API_TIMEOUT_MS = 15_000;

function extractError(payload: unknown): string | undefined {
	if (payload && typeof payload === "object") {
		const err = (payload as Record<string, unknown>).error;
		return typeof err === "string" ? err : undefined;
	}
	return undefined;
}

export function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return "処理に失敗しました";
}

export async function api<T>(
	path: string,
	options: RequestInit = {},
): Promise<T> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
	try {
		const response = await fetch(path, {
			...options,
			headers: {
				...(options.body ? { "content-type": "application/json" } : {}),
				...options.headers,
			},
			signal: controller.signal,
		});
		const payload: unknown = await response.json();
		if (!response.ok) {
			const err = extractError(payload);
			throw new Error(err || `Request failed (${response.status})`);
		}
		return payload as T;
	} finally {
		clearTimeout(timer);
	}
}

// ==========================================
// 2. Format Utilities
// ==========================================
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

// ==========================================
// 3. Device Detection
// ==========================================
export function isIosDevice(): boolean {
	const ua = navigator.userAgent || "";
	return (
		/iPad|iPhone|iPod/.test(ua) ||
		(/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
	);
}

export function isMobileBrowser(): boolean {
	const ua = navigator.userAgent || "";
	return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
		ua,
	);
}

export function isInAppBrowser(): boolean {
	const ua = navigator.userAgent || "";
	return /\b(Twitter|FBAV|Instagram|Line|IAB|FB_IAB|FBAN)\b/i.test(ua);
}

export function isGoogleApp(): boolean {
	const ua = navigator.userAgent || "";
	return /\bGSA\//.test(ua);
}

export function isStandaloneDisplay(): boolean {
	return (
		window.matchMedia("(display-mode: standalone)").matches ||
		(window.navigator as unknown as { standalone?: boolean }).standalone ===
			true
	);
}

// ==========================================
// 4. Media Utilities
// ==========================================
export function proxiedImageUrl(value: unknown): string {
	if (!value) return "";
	const url = safeHttpsUrl(value);
	return `/api/media?url=${encodeURIComponent(url)}`;
}

export function safeHttpsUrl(value: unknown): string {
	if (!value) return "";
	const s = String(value);
	return s.startsWith("http://") ? s.replace("http://", "https://") : s;
}

export function youtubeLink(value?: string | null): string {
	if (!value) return "";
	return value;
}

// ==========================================
// 5. Sort Order
// ==========================================
export type SortOrder = "time-asc" | "time-desc" | "tournament";

export const SORT_OPTIONS: SortOrder[] = [
	"time-asc",
	"time-desc",
	"tournament",
];

export const DEFAULT_SORT_ORDER: SortOrder = "time-asc";

export function isValidSortOrder(value: unknown): value is SortOrder {
	return SORT_OPTIONS.includes(value as SortOrder);
}

// ==========================================
// 6. Push Utilities
// ==========================================
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
	const padding = "=".repeat((4 - (value.length % 4)) % 4);
	const decoded = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
	const bytes = new Uint8Array(decoded.length);
	for (let i = 0; i < decoded.length; i++) {
		bytes[i] = decoded.charCodeAt(i);
	}
	return bytes;
}

// ==========================================
// 7. Match Grouping and Merging
// ==========================================
export interface TournamentGroup {
	name: string;
	logoUrl?: string;
	matches: MatchSummary[];
}

export function sortedMatches(
	matches: MatchSummary[],
	sortOrder = DEFAULT_SORT_ORDER,
): MatchSummary[] {
	const direction = sortOrder === "time-desc" ? -1 : 1;
	return [...matches].sort(
		(left, right) => direction * compareStartTime(left, right),
	);
}

export function tournamentGroups(matches: MatchSummary[]): TournamentGroup[] {
	const groups = new Map<string, TournamentGroup>();
	const sorted = sortedMatches(matches);
	for (const match of sorted) {
		const name = String(match.tournament || "BWF");
		const current = groups.get(name);
		if (current) {
			current.matches.push(match);
		} else {
			groups.set(name, {
				name,
				logoUrl: match.tournamentLogoUrl,
				matches: [match],
			});
		}
	}
	return [...groups.values()].sort((left, right) =>
		left.name.localeCompare(right.name, "ja"),
	);
}

export function previousGameScoreline(
	games?: Array<{ team1: number; team2: number }> | null,
): string {
	if (!Array.isArray(games)) {
		return "";
	}
	return games
		.filter(
			(game) => Number.isFinite(game?.team1) && Number.isFinite(game?.team2),
		)
		.map((game) => `${game.team1}-${game.team2}`)
		.join(" / ");
}

export function mergeLiveMatches(
	currentMatches: MatchSummary[],
	freshMatches: MatchSummary[],
): MatchSummary[] {
	const currentById = new Map<string, MatchSummary>(
		currentMatches.map((match) => [match.id, match]),
	);
	const freshLive = freshMatches.filter((match) => match.eventType === "live");
	const freshLiveIds = new Set(freshLive.map((match) => match.id));
	const mergedLive = freshLive.map((fresh) => {
		const current = currentById.get(fresh.id);
		const merged: MatchSummary & { scoreChangedTeam?: 1 | 2 } = {
			...(current || {}),
			...fresh,
		};
		merged.scoreChangedTeam = changedScoreTeam(current, fresh);
		if (current?.h2h && !fresh.h2h) {
			merged.h2h = current.h2h;
		}
		if (!fresh.youtubeUrl) {
			merged.youtubeUrl = isDirectYoutubeUrl(current?.youtubeUrl)
				? current?.youtubeUrl || ""
				: "";
		}
		return merged;
	});
	const scheduled = currentMatches.filter(
		(match) => match.eventType === "scheduled" && !freshLiveIds.has(match.id),
	);
	return [...mergedLive, ...scheduled];
}

function changedScoreTeam(
	current: MatchSummary | undefined,
	fresh: MatchSummary,
): 1 | 2 | undefined {
	const previous = current?.scores?.at(-1);
	const next = fresh?.scores?.at(-1);
	if (!previous || !next) {
		return undefined;
	}
	const unchanged =
		previous.game === next.game &&
		previous.team1 === next.team1 &&
		previous.team2 === next.team2;
	if (unchanged) {
		return undefined;
	}
	if (next.lastPointWinner === 1 || next.lastPointWinner === 2) {
		return next.lastPointWinner;
	}
	if (next.team1 > previous.team1 && next.team2 === previous.team2) {
		return 1;
	}
	if (next.team2 > previous.team2 && next.team1 === previous.team1) {
		return 2;
	}
	return undefined;
}

function isDirectYoutubeUrl(value: string | undefined): boolean {
	if (!value) {
		return false;
	}
	try {
		const url = new URL(value);
		return (
			(url.hostname === "youtu.be" && /^\/[\w-]{11}$/.test(url.pathname)) ||
			(["youtube.com", "www.youtube.com", "m.youtube.com"].includes(
				url.hostname,
			) &&
				url.pathname === "/watch" &&
				/^[\w-]{11}$/.test(url.searchParams.get("v") || ""))
		);
	} catch {
		return false;
	}
}

function compareStartTime(left: MatchSummary, right: MatchSummary): number {
	return String(left.startTime || "\uffff").localeCompare(
		String(right.startTime || "\uffff"),
	);
}
