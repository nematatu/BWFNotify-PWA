const YOUTUBE_HOSTS = new Set([
	"youtube.com",
	"www.youtube.com",
	"m.youtube.com",
	"youtu.be",
]);

type YoutubeMatch = {
	tournament: string;
	players: string[];
	court?: string;
	startTime?: string;
};

export function resolveYoutubeMatchUrl(
	match: YoutubeMatch,
	directUrl?: string,
): string {
	const direct = validYoutubeUrl(directUrl);
	if (direct) {
		return direct;
	}

	const date = match.startTime?.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
	const query = [
		match.tournament,
		date,
		match.court,
		match.players.join(" vs "),
		"BWF TV",
	]
		.filter(Boolean)
		.join(" ")
		.slice(0, 240);
	const url = new URL("https://www.youtube.com/results");
	url.searchParams.set("search_query", query);
	return url.toString();
}

export function validYoutubeUrl(value: string | undefined): string | null {
	if (!value || value.length > 2048) {
		return null;
	}
	try {
		const url = new URL(value);
		return url.protocol === "https:" && YOUTUBE_HOSTS.has(url.hostname)
			? url.toString()
			: null;
	} catch {
		return null;
	}
}
