export type YoutubeStreamSource = {
	handle: string;
	authorPath: string;
};

type YoutubeStreamRule = {
	tournamentIncludes?: string;
	categoryIncludes?: string;
	sources: YoutubeStreamSource[];
};

const BWF_TV = { handle: "@BWF", authorPath: "/@BWF" };

// More specific tournament rules must precede category-wide rules.
const YOUTUBE_STREAM_RULES: YoutubeStreamRule[] = [
	{
		tournamentIncludes: "NORTHERN MARIANAS OPEN",
		sources: [
			{
				handle: "@BadmintonOceaniaTV",
				authorPath: "/@BadmintonOceaniaTV",
			},
		],
	},
	{
		tournamentIncludes: "JAPAN OPEN",
		sources: [BWF_TV, { handle: "@jsports", authorPath: "/@jsports" }],
	},
	{
		categoryIncludes: "BWF WORLD TOUR",
		sources: [BWF_TV],
	},
];

export function youtubeStreamSourcesFor(
	tournament: string,
	category?: string,
): YoutubeStreamSource[] {
	const normalizedTournament = tournament.toUpperCase();
	const normalizedCategory = (category || "").toUpperCase();
	return (
		YOUTUBE_STREAM_RULES.find(
			(rule) =>
				(rule.tournamentIncludes &&
					normalizedTournament.includes(rule.tournamentIncludes)) ||
				(rule.categoryIncludes &&
					normalizedCategory.includes(rule.categoryIncludes)),
		)?.sources || []
	);
}
