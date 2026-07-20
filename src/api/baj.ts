import { parseHTML } from "linkedom";
import type { UpcomingTournament } from "../type";

const BAJ_TOURNAMENT_URL =
	"https://www.badminton.or.jp/corporate/concerned/tournament";
const BAJ_USER_AGENT =
	"BWFNotify/1.0 (+https://github.com/nematatu/BWFNotify-PWA)";
const HORIZON_DAYS = 62;
const MAX_UPCOMING_TOURNAMENTS = 8;

type TournamentDraft = UpcomingTournament & {
	category?: string;
};

export async function fetchUpcomingTournaments(
	now: Date,
	fetcher: typeof fetch = fetch,
): Promise<UpcomingTournament[]> {
	const sourceUrls = monthQueries(now).flatMap(({ year, month }) =>
		[1, 2].map(
			(page) =>
				`${BAJ_TOURNAMENT_URL}?year=${year}&month=${month}&page=${page}`,
		),
	);
	const responses = await Promise.all(
		sourceUrls.map(async (sourceUrl) => ({
			sourceUrl,
			response: await fetcher(sourceUrl, {
				headers: {
					Accept: "text/html,application/xhtml+xml",
					"User-Agent": BAJ_USER_AGENT,
				},
			}).catch(() => new Response(null, { status: 502 })),
		})),
	);
	if (responses.every(({ response }) => !response.ok)) {
		throw new Error(
			`BAJ tournament pages are unavailable (${responses.map(({ response }) => response.status).join(",")})`,
		);
	}

	const tournaments = (
		await Promise.all(
			responses
				.filter(({ response }) => response.ok)
				.map(({ response, sourceUrl }) =>
					parseTournamentPage(response, sourceUrl),
				),
		)
	)
		.flat()
		.filter((tournament) => isRelevantTournament(tournament, now));

	const unique = new Map<string, TournamentDraft>();
	for (const tournament of tournaments) {
		if (!unique.has(tournament.id)) unique.set(tournament.id, tournament);
	}

	return [...unique.values()]
		.sort((left, right) => left.startDate.localeCompare(right.startDate))
		.slice(0, MAX_UPCOMING_TOURNAMENTS)
		.map(({ id, name, startDate, endDate, category, bwfUrl, bajUrl }) => ({
			id,
			name,
			startDate,
			endDate,
			grade: tournamentGrade(category),
			bwfUrl,
			bajUrl,
		}));
}

function tournamentGrade(category?: string) {
	return category
		?.replace(/^HSBC BWF World Tour\s*/i, "")
		.replace(/^BWF Tour\s*/i, "")
		.replace(/^BWF\s*/i, "")
		.trim();
}

export async function parseTournamentPage(
	response: Response,
	sourceUrl = BAJ_TOURNAMENT_URL,
): Promise<TournamentDraft[]> {
	const { document } = parseHTML(await response.text());
	return [...document.querySelectorAll("li.v-tournament__item")].flatMap(
		(item) => {
			const name = item.querySelector(".v-tournament__ttl")?.textContent.trim();
			const date = item
				.querySelector(".v-tournament__date")
				?.textContent.trim();
			const dates = date?.match(
				/(\d{4}\.\d{1,2}\.\d{1,2})\s*-\s*(\d{4}\.\d{1,2}\.\d{1,2})/,
			);
			if (!name || !dates) return [];
			const links = [...item.querySelectorAll(".v-tournament__links-link")];
			const bajDocumentUrl = links
				.map((link) => link.getAttribute("href"))
				.find((href) => href && isBajDocument(href));
			return [
				{
					id: `${normalizeDate(dates[1])}:${name}`,
					name,
					startDate: normalizeDate(dates[1]),
					endDate: normalizeDate(dates[2]),
					category: item.querySelector(".c-tag")?.textContent.trim(),
					bwfUrl:
						links
							.find((link) =>
								/BWF|大会サイト/i.test(
									`${link.textContent} ${link.getAttribute("href")}`,
								),
							)
							?.getAttribute("href") || undefined,
					bajUrl: bajDocumentUrl
						? new URL(bajDocumentUrl, sourceUrl).toString()
						: undefined,
				},
			];
		},
	);
}

function isBajDocument(href: string) {
	const url = new URL(href, BAJ_TOURNAMENT_URL);
	return (
		["badminton.or.jp", "www.badminton.or.jp"].includes(url.hostname) &&
		(url.pathname.startsWith("/storage/") || url.pathname.startsWith("/games/"))
	);
}

function isRelevantTournament(tournament: TournamentDraft, now: Date) {
	const end = Date.parse(`${tournament.endDate}T23:59:59+09:00`);
	const horizon = now.getTime() + HORIZON_DAYS * 24 * 60 * 60 * 1000;
	return (
		end >= now.getTime() &&
		Date.parse(`${tournament.startDate}T00:00:00+09:00`) <= horizon &&
		/BWF|bwfbadminton\.com/i.test(`${tournament.category} ${tournament.bwfUrl}`)
	);
}

function monthQueries(now: Date) {
	const [year, month] = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Tokyo",
		year: "numeric",
		month: "2-digit",
	})
		.format(now)
		.split("-")
		.map(Number);
	return Array.from({ length: 3 }, (_, offset) => {
		const date = new Date(Date.UTC(year, month - 1 + offset, 1));
		return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
	});
}

function normalizeDate(value: string) {
	const [year, month, day] = value.split(".");
	return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}
