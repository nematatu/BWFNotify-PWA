import { extractTextItems, getDocumentProxy } from "unpdf";
import type { MatchSummary, UpcomingTournament } from "../type";

const BAJ_TOURNAMENT_URL =
	"https://www.badminton.or.jp/corporate/concerned/tournament";
const BAJ_USER_AGENT =
	"BWFNotify/1.0 (+https://github.com/nematatu/BWFNotify-PWA)";
const PDF_MAX_BYTES = 2 * 1024 * 1024;
const HORIZON_DAYS = 62;
const MAX_UPCOMING_TOURNAMENTS = 6;

type TournamentDraft = Omit<
	UpcomingTournament,
	"id" | "japanesePlayers" | "matchDataAvailable" | "timetableAvailable"
>;

type LinkDraft = { label: string; url: string };
type ParsedDraft = Partial<TournamentDraft> & {
	date?: string;
	links: LinkDraft[];
};

export async function fetchUpcomingTournaments(
	now: Date,
	previous: UpcomingTournament[],
	matches: MatchSummary[],
	fetcher: typeof fetch = fetch,
): Promise<UpcomingTournament[]> {
	const pages = await Promise.all(
		monthQueries(now).flatMap(({ year, month }) =>
			[1, 2].map((page) =>
				fetcher(
					`${BAJ_TOURNAMENT_URL}?year=${year}&month=${month}&page=${page}`,
					{
						headers: {
							Accept: "text/html,application/xhtml+xml",
							"User-Agent": BAJ_USER_AGENT,
						},
						cf: { cacheEverything: true, cacheTtl: 12 * 60 * 60 },
					},
				).catch(() => new Response(null, { status: 502 })),
			),
		),
	);
	if (pages.every((response) => !response.ok)) {
		throw new Error(
			`BAJ tournament pages are unavailable (${pages.map((page) => page.status).join(",")})`,
		);
	}

	const drafts = selectTournaments(
		dedupeTournaments(
			(
				await Promise.all(
					pages.filter((page) => page.ok).map(parseTournamentPage),
				)
			)
				.flat()
				.filter((tournament) => isRelevantTournament(tournament, now)),
		),
	);
	const previousById = new Map(previous.map((item) => [item.id, item]));
	const tournaments: UpcomingTournament[] = [];
	for (const draft of drafts) {
		const id = tournamentId(draft);
		const old = previousById.get(id);
		const sameSources =
			old &&
			JSON.stringify(old.participantSourceUrls) ===
				JSON.stringify(draft.participantSourceUrls);
		const parsedPlayers = sameSources
			? old.japanesePlayers
			: await playersFromPdfs(draft.participantSourceUrls, fetcher);
		const japanesePlayers = parsedPlayers ?? old?.japanesePlayers ?? [];
		tournaments.push({
			...draft,
			id,
			japanesePlayers,
			matchDataAvailable: false,
			timetableAvailable: false,
		});
	}
	return updateTournamentAvailability(tournaments, matches);
}

export function updateTournamentAvailability(
	tournaments: UpcomingTournament[],
	matches: MatchSummary[],
): UpcomingTournament[] {
	return tournaments.map((tournament) => {
		const related = matches.filter((match) =>
			belongsToTournament(match, tournament, tournament.japanesePlayers),
		);
		return {
			...tournament,
			matchDataAvailable: related.length > 0,
			timetableAvailable: related.some(
				(match) => Boolean(match.startTime) || Boolean(match.court),
			),
		};
	});
}

export function calendarRefreshDue(
	checkedAt: string | null | undefined,
	now: Date,
): boolean {
	const previous = checkedAt ? Date.parse(checkedAt) : Number.NaN;
	return (
		!Number.isFinite(previous) ||
		now.getTime() - previous >= 12 * 60 * 60 * 1000
	);
}

export async function parseTournamentPage(
	response: Response,
): Promise<TournamentDraft[]> {
	const handler = new TournamentPageHandler();
	await new HTMLRewriter()
		.on("li.v-tournament__item", handler)
		.on(".v-tournament__date", handler.fieldHandler("date"))
		.on(".v-tournament__ttl", handler.fieldHandler("name"))
		.on(".v-tournament__place", handler.fieldHandler("place"))
		.on(".c-tag", handler.fieldHandler("category"))
		.on(".v-tournament__links-link", handler.link())
		.transform(response)
		.arrayBuffer();
	return handler.results();
}

class TournamentPageHandler {
	private current: ParsedDraft | undefined;
	private readonly tournaments: TournamentDraft[] = [];

	element(element: Element) {
		this.current = { links: [] };
		element.onEndTag(() => this.finish());
	}

	fieldHandler(field: "date" | "name" | "place" | "category") {
		return {
			text: (chunk: Text) => {
				if (!this.current) return;
				this.current[field] =
					`${this.current[field] || ""}${chunk.text}`.trim();
			},
		};
	}

	link() {
		let link: LinkDraft | undefined;
		return {
			element: (element: Element) => {
				const url = element.getAttribute("href");
				link = url ? { label: "", url } : undefined;
				if (link) this.current?.links.push(link);
			},
			text: (chunk: Text) => {
				if (link) link.label += chunk.text.trim();
			},
		};
	}

	results() {
		return this.tournaments;
	}

	private finish() {
		const current = this.current;
		this.current = undefined;
		if (!current?.name || !current.date) return;
		const dates = current.date.match(
			/(\d{4}\.\d{1,2}\.\d{1,2})\s*-\s*(\d{4}\.\d{1,2}\.\d{1,2})/,
		);
		if (!dates) return;
		const links = current.links || [];
		const participantSourceUrls = links
			.filter((link) => /^(派遣|参加者)$/.test(link.label))
			.map((link) => absoluteBajUrl(link.url))
			.sort();
		const officialUrl = links.find((link) =>
			/BWF|大会サイト|速報サイト/i.test(`${link.label} ${link.url}`),
		)?.url;
		this.tournaments.push({
			name: current.name,
			category: current.category,
			startDate: normalizeDate(dates[1]),
			endDate: normalizeDate(dates[2]),
			place: current.place,
			officialUrl,
			participantSourceUrls,
		});
	}
}

async function playersFromPdfs(
	urls: string[],
	fetcher: typeof fetch,
): Promise<string[] | null> {
	const players = new Set<string>();
	let parsed = false;
	for (const url of urls) {
		try {
			const response = await fetcher(url, {
				headers: {
					Accept: "application/pdf",
					"User-Agent": BAJ_USER_AGENT,
				},
				cf: { cacheEverything: true, cacheTtl: 12 * 60 * 60 },
			});
			const contentLength = Number(response.headers.get("content-length") || 0);
			if (!response.ok || contentLength > PDF_MAX_BYTES) continue;
			const bytes = new Uint8Array(await response.arrayBuffer());
			if (bytes.byteLength > PDF_MAX_BYTES) continue;
			for (const player of await extractBajPlayers(bytes)) players.add(player);
			parsed = true;
		} catch (error) {
			console.error(
				JSON.stringify({
					event: "baj-participants-error",
					url,
					error: error instanceof Error ? error.message : String(error),
				}),
			);
		}
	}
	return parsed ? [...players] : null;
}

export async function extractBajPlayers(bytes: Uint8Array): Promise<string[]> {
	const pdf = await getDocumentProxy(bytes);
	const { items } = await extractTextItems(pdf);
	return extractBajPlayersFromItems(items);
}

export function extractBajPlayersFromItems(
	items: Array<Array<{ str: string; x: number; y: number }>>,
): string[] {
	const players = new Set<string>();
	for (const page of items) {
		const rows = groupRows(page);
		const participantHeader = rows.find((row) => row.text.includes("参加者："));
		if (participantHeader) {
			const participantEnd =
				rows.find(
					(row) =>
						row.y < participantHeader.y && row.text.includes("スタッフ："),
				)?.y ?? Number.NEGATIVE_INFINITY;
			const noX = participantHeader.items.find((item) => item.str === "No.")?.x;
			const affiliationX = participantHeader.items.find(
				(item) => item.str === "所属",
			)?.x;
			if (noX != null && affiliationX != null) {
				for (const row of rows) {
					if (row.y >= participantHeader.y || row.y <= participantEnd) continue;
					const name = row.items
						.filter((item) => item.x > noX + 10 && item.x < affiliationX - 20)
						.map((item) => item.str.trim())
						.filter((value) => value && !/^\d+$/.test(value))
						.join("");
					if (isJapanesePlayerName(name)) players.add(name);
				}
			}
		}

		const playerStart = rows.find((row) =>
			row.text.replace(/\s/g, "").startsWith("選手"),
		);
		if (playerStart) {
			for (const row of rows) {
				if (
					row.y > playerStart.y ||
					row.text.replace(/\s/g, "").includes("以上")
				)
					continue;
				const name = row.items
					.filter((item) => item.x > 130 && item.x < 235)
					.map((item) => item.str.trim())
					.filter((value) => Boolean(value) && value !== "※")
					.join("");
				if (isJapanesePlayerName(name)) players.add(name);
			}
		}
	}
	return [...players];
}

function groupRows(items: Array<{ str: string; x: number; y: number }>) {
	const rows: Array<{
		y: number;
		text: string;
		items: Array<{ str: string; x: number; y: number }>;
	}> = [];
	for (const item of items) {
		let row = rows.find((candidate) => Math.abs(candidate.y - item.y) < 2);
		if (!row) {
			row = { y: item.y, text: "", items: [] };
			rows.push(row);
		}
		row.items.push(item);
	}
	for (const row of rows) {
		row.items.sort((left, right) => left.x - right.x);
		row.text = row.items.map((item) => item.str).join("");
	}
	return rows.sort((left, right) => right.y - left.y);
}

function isJapanesePlayerName(value: string): boolean {
	return /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}・ー]{2,12}$/u.test(
		value,
	);
}

function monthQueries(now: Date) {
	const current = todayInJapan(now).split("-").map(Number);
	return Array.from({ length: 3 }, (_, offset) => {
		const date = new Date(Date.UTC(current[0], current[1] - 1 + offset, 1));
		return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
	});
}

function todayInJapan(now: Date) {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Tokyo",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(now);
}

function isRelevantTournament(tournament: TournamentDraft, now: Date): boolean {
	const start = Date.parse(`${tournament.startDate}T00:00:00+09:00`);
	const end = Date.parse(`${tournament.endDate}T23:59:59+09:00`);
	const horizon = now.getTime() + HORIZON_DAYS * 24 * 60 * 60 * 1000;
	return (
		end >= now.getTime() &&
		start <= horizon &&
		tournament.participantSourceUrls.length > 0 &&
		/BWF|bwfbadminton\.com/i.test(
			`${tournament.category} ${tournament.officialUrl}`,
		)
	);
}

function dedupeTournaments(tournaments: TournamentDraft[]) {
	return [
		...new Map(tournaments.map((item) => [tournamentId(item), item])).values(),
	].sort((left, right) => left.startDate.localeCompare(right.startDate));
}

function selectTournaments(tournaments: TournamentDraft[]) {
	const priority = tournaments.filter((tournament) =>
		/Grade\s*1|Super\s*1000|世界.*選手権/i.test(
			`${tournament.category} ${tournament.name}`,
		),
	);
	const priorityIds = new Set(priority.map(tournamentId));
	return [
		...priority,
		...tournaments.filter(
			(tournament) => !priorityIds.has(tournamentId(tournament)),
		),
	]
		.slice(0, MAX_UPCOMING_TOURNAMENTS)
		.sort((left, right) => left.startDate.localeCompare(right.startDate));
}

function tournamentId(tournament: Pick<TournamentDraft, "name" | "startDate">) {
	return `${tournament.startDate}:${tournament.name}`;
}

function sameTournament(left: string, right: string) {
	const normalize = (value: string) =>
		value.toLowerCase().replace(/victor|bwf|hsbc|20\d{2}|[^\p{L}\p{N}]/gu, "");
	const a = normalize(left);
	const b = normalize(right);
	return Boolean(a && b && (a.includes(b) || b.includes(a)));
}

function belongsToTournament(
	match: MatchSummary,
	tournament: TournamentDraft,
	japanesePlayers: string[],
) {
	if (sameTournament(match.tournament, tournament.name)) return true;
	const matchDate = match.tournamentDate || match.startTime?.slice(0, 10);
	if (
		!matchDate ||
		matchDate < tournament.startDate ||
		matchDate > tournament.endDate
	) {
		return false;
	}
	const participants = new Set(japanesePlayers.map(compactName));
	return match.teams.some((team) =>
		team.players.some(
			(player) =>
				player.isJapanese && participants.has(compactName(player.name)),
		),
	);
}

function compactName(value: string) {
	return value.replace(/[\s・]/g, "");
}

function normalizeDate(value: string) {
	const [year, month, day] = value.split(".");
	return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function absoluteBajUrl(url: string) {
	return new URL(url, BAJ_TOURNAMENT_URL).toString();
}
