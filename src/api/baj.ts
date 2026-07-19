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
	officialUrl?: string;
};

export async function fetchUpcomingTournaments(
	now: Date,
	fetcher: typeof fetch = fetch,
): Promise<UpcomingTournament[]> {
	const responses = await Promise.all(
		monthQueries(now).flatMap(({ year, month }) =>
			[1, 2].map((page) =>
				fetcher(
					`${BAJ_TOURNAMENT_URL}?year=${year}&month=${month}&page=${page}`,
					{
						headers: {
							Accept: "text/html,application/xhtml+xml",
							"User-Agent": BAJ_USER_AGENT,
						},
					},
				).catch(() => new Response(null, { status: 502 })),
			),
		),
	);
	if (responses.every((response) => !response.ok)) {
		throw new Error(
			`BAJ tournament pages are unavailable (${responses.map((response) => response.status).join(",")})`,
		);
	}

	const tournaments = (
		await Promise.all(
			responses.filter((response) => response.ok).map(parseTournamentPage),
		)
	)
		.flat()
		.filter((tournament) => isRelevantTournament(tournament, now));

	return [...new Map(tournaments.map((item) => [item.id, item])).values()]
		.sort((left, right) => left.startDate.localeCompare(right.startDate))
		.slice(0, MAX_UPCOMING_TOURNAMENTS)
		.map(({ id, name, startDate, endDate }) => ({
			id,
			name,
			startDate,
			endDate,
		}));
}

export async function parseTournamentPage(
	response: Response,
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
			return [
				{
					id: `${normalizeDate(dates[1])}:${name}`,
					name,
					startDate: normalizeDate(dates[1]),
					endDate: normalizeDate(dates[2]),
					category: item.querySelector(".c-tag")?.textContent.trim(),
					officialUrl:
						links
							.find((link) =>
								/BWF|大会サイト/i.test(
									`${link.textContent} ${link.getAttribute("href")}`,
								),
							)
							?.getAttribute("href") || undefined,
				},
			];
		},
	);
}

function isRelevantTournament(tournament: TournamentDraft, now: Date) {
	const end = Date.parse(`${tournament.endDate}T23:59:59+09:00`);
	const horizon = now.getTime() + HORIZON_DAYS * 24 * 60 * 60 * 1000;
	return (
		end >= now.getTime() &&
		Date.parse(`${tournament.startDate}T00:00:00+09:00`) <= horizon &&
		/BWF|bwfbadminton\.com/i.test(
			`${tournament.category} ${tournament.officialUrl}`,
		)
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
