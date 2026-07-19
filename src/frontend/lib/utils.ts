import { createContext, useContext } from "solid-js";
import type { MatchSummary } from "../../type";

// ==========================================
// 1. App Context (Eliminates Prop Drilling)
// ==========================================
export type SortOrder = "time-asc" | "time-desc" | "tournament";
export const SORT_OPTIONS: SortOrder[] = [
	"time-asc",
	"time-desc",
	"tournament",
];
export const DEFAULT_SORT_ORDER: SortOrder = "time-asc";

export const AppContext = createContext<{
	matches: () => MatchSummary[];
	excludedMatchIds: () => Set<string>;
	notificationDisabled: () => boolean;
	onNotificationChange: (matchId: string, enabled: boolean) => void;
	sortOrder: () => SortOrder;
	setSortOrder: (order: SortOrder) => void;
	currentView: () => "live" | "scheduled";
	setCurrentView: (view: "live" | "scheduled") => void;
	loadStatus: () => Promise<void>;
	notifText: () => string;
	notifError: () => boolean;
	testDisabled: () => boolean;
	toggleChecked: () => boolean;
	toggleDisabled: () => boolean;
	standalone: () => boolean;
	inApp: () => boolean;
	onTest: () => void;
	onToggleClick: (e: Event) => void;
	onToggleChange: (e: Event) => void;
	onShowInstall: () => void;
}>();

export const useApp = () => {
	const ctx = useContext(AppContext);
	if (!ctx) throw new Error("useApp must be used within AppProvider");
	return ctx;
};

// ==========================================
// 2. API Helper
// ==========================================
export const errorMessage = (e: unknown) =>
	e instanceof Error ? e.message : "処理に失敗しました";

export async function api<T>(
	path: string,
	options: RequestInit = {},
): Promise<T> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 15_000);
	try {
		const res = await fetch(path, {
			...options,
			headers: {
				...(options.body ? { "content-type": "application/json" } : {}),
				...options.headers,
			},
			signal: controller.signal,
		});
		const payload = await res.json();
		if (!res.ok) {
			const err =
				payload && typeof payload === "object"
					? (payload as Record<string, unknown>).error
					: undefined;
			throw new Error(
				typeof err === "string" ? err : `Request failed (${res.status})`,
			);
		}
		return payload as T;
	} finally {
		clearTimeout(timer);
	}
}

// ==========================================
// 3. Format Utilities
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

export const formatDate = (v: string) => {
	const d = new Date(v);
	return Number.isNaN(d.getTime()) ? "時刻不明" : FMT_DATETIME.format(d);
};

export const formatMatchTime = (v: string | undefined) => {
	if (!v) return "時刻未定";
	const d = new Date(
		/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v)
			? `${v.replace(" ", "T")}Z`
			: v,
	);
	return Number.isNaN(d.getTime()) ? v : FMT_DATETIME.format(d);
};

export const formatTournamentDate = (v: string | undefined) => {
	if (!v) return "";
	const d = new Date(`${v}T00:00:00`);
	return Number.isNaN(d.getTime()) ? v : FMT_DATE_MEDIUM.format(d);
};

export const playerInitial = (v: string) => {
	const pts = v.trim().split(/\s+/);
	return pts.length > 1
		? pts.map((p) => p.at(0) || "").join("")
		: v.substring(0, 2);
};

export const teamLabel = (t: { players?: { name: string }[] } | undefined) =>
	t?.players?.map((p) => p.name).join(" / ") || "選手不明";

const ROUND_LABELS: Record<string, string> = {
	F: "決勝",
	SF: "準決勝",
	QF: "準々決勝",
	R16: "2回戦",
	R32: "1回戦",
	R64: "1回戦",
};
export const displayRound = (v?: string) => (v ? ROUND_LABELS[v] || v : "");
export const displayCourt = (v?: string) =>
	v ? v.replace(/Court\s+(\d+)/i, "第$1コート") : "";
export const displayTournamentCategory = (v?: string) =>
	v ? v.replace("HSBC BWF World Tour ", "") : "";

// ==========================================
// 4. Device & Push Utilities
// ==========================================
export const isIosDevice = () => {
	const ua = navigator.userAgent || "";
	return (
		/iPad|iPhone|iPod/.test(ua) ||
		(/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
	);
};
export const isMobileBrowser = () =>
	/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
		navigator.userAgent || "",
	);
export const isInAppBrowser = () =>
	/\b(Twitter|FBAV|Instagram|Line|IAB|FB_IAB|FBAN)\b/i.test(
		navigator.userAgent || "",
	);
export const isGoogleApp = () => /\bGSA\//.test(navigator.userAgent || "");
export const isStandaloneDisplay = () =>
	window.matchMedia("(display-mode: standalone)").matches ||
	(window.navigator as unknown as { standalone?: boolean }).standalone === true;

export const base64UrlToBytes = (v: string) => {
	const pad = "=".repeat((4 - (v.length % 4)) % 4);
	const dec = atob((v + pad).replace(/-/g, "+").replace(/_/g, "/"));
	return Uint8Array.from(dec, (c) => c.charCodeAt(0));
};

// ==========================================
// 5. Media & YouTube Utilities
// ==========================================
export const safeHttpsUrl = (v: unknown) =>
	String(v || "").replace(/^http:\/\//, "https://");
export const proxiedImageUrl = (v: unknown) =>
	v ? `/api/media?url=${encodeURIComponent(safeHttpsUrl(v))}` : "";
export const youtubeLink = (v?: string | null) => v || "";

// ==========================================
// 6. Match Grouping and Merging
// ==========================================
export interface TournamentGroup {
	name: string;
	logoUrl?: string;
	matches: MatchSummary[];
}

export const isValidSortOrder = (v: unknown): v is SortOrder =>
	SORT_OPTIONS.includes(v as SortOrder);

export const sortedMatches = (
	matches: MatchSummary[],
	ord: SortOrder = DEFAULT_SORT_ORDER,
) => {
	const dir = ord === "time-desc" ? -1 : 1;
	return [...matches].sort(
		(l, r) =>
			dir *
			String(l.startTime || "\uffff").localeCompare(
				String(r.startTime || "\uffff"),
			),
	);
};

export const tournamentGroups = (
	matches: MatchSummary[],
): TournamentGroup[] => {
	const groups = new Map<string, TournamentGroup>();
	for (const m of sortedMatches(matches)) {
		const name = m.tournament || "BWF";
		const curr = groups.get(name);
		if (curr) curr.matches.push(m);
		else groups.set(name, { name, logoUrl: m.tournamentLogoUrl, matches: [m] });
	}
	return [...groups.values()].sort((l, r) =>
		l.name.localeCompare(r.name, "ja"),
	);
};

export const previousGameScoreline = (
	games?: Array<{ team1: number; team2: number }> | null,
) =>
	Array.isArray(games)
		? games
				.filter((g) => Number.isFinite(g?.team1) && Number.isFinite(g?.team2))
				.map((g) => `${g.team1}-${g.team2}`)
				.join(" / ")
		: "";

export function mergeLiveMatches(
	currentMatches: MatchSummary[],
	freshMatches: MatchSummary[],
): MatchSummary[] {
	const currMap = new Map(currentMatches.map((m) => [m.id, m]));
	const freshLive = freshMatches.filter((m) => m.eventType === "live");
	const freshLiveIds = new Set(freshLive.map((m) => m.id));

	const mergedLive = freshLive.map((fresh) => {
		const curr = currMap.get(fresh.id);
		const merged: MatchSummary & { scoreChangedTeam?: 1 | 2 } = {
			...curr,
			...fresh,
		};
		merged.scoreChangedTeam = changedScoreTeam(curr, fresh);
		if (curr?.h2h && !fresh.h2h) merged.h2h = curr.h2h;
		if (
			!fresh.youtubeUrl &&
			curr?.youtubeUrl &&
			isDirectYoutubeUrl(curr.youtubeUrl)
		) {
			merged.youtubeUrl = curr.youtubeUrl;
		}
		return merged;
	});

	return [
		...mergedLive,
		...currentMatches.filter(
			(m) => m.eventType === "scheduled" && !freshLiveIds.has(m.id),
		),
	];
}

const changedScoreTeam = (
	curr: MatchSummary | undefined,
	fresh: MatchSummary,
): 1 | 2 | undefined => {
	const prev = curr?.scores?.at(-1);
	const next = fresh?.scores?.at(-1);
	if (
		!prev ||
		!next ||
		(prev.game === next.game &&
			prev.team1 === next.team1 &&
			prev.team2 === next.team2)
	)
		return undefined;
	if (next.lastPointWinner === 1 || next.lastPointWinner === 2)
		return next.lastPointWinner;
	if (next.team1 > prev.team1 && next.team2 === prev.team2) return 1;
	if (next.team2 > prev.team2 && next.team1 === prev.team1) return 2;
	return undefined;
};

const isDirectYoutubeUrl = (v?: string): boolean => {
	if (!v) return false;
	try {
		const u = new URL(v);
		return (
			(u.hostname === "youtu.be" && /^\/[\w-]{11}$/.test(u.pathname)) ||
			(["youtube.com", "www.youtube.com", "m.youtube.com"].includes(
				u.hostname,
			) &&
				u.pathname === "/watch" &&
				/^[\w-]{11}$/.test(u.searchParams.get("v") || ""))
		);
	} catch {
		return false;
	}
};
