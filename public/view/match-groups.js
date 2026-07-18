export const DEFAULT_SORT_ORDER = "time-asc";

export function sortedMatches(matches, sortOrder = DEFAULT_SORT_ORDER) {
	const direction = sortOrder === "time-desc" ? -1 : 1;
	return [...matches].sort(
		(left, right) => direction * compareStartTime(left, right),
	);
}

export function tournamentGroups(matches) {
	const groups = new Map();
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

export function mergeLiveMatches(currentMatches, freshMatches) {
	const currentById = new Map(currentMatches.map((match) => [match.id, match]));
	const freshLive = freshMatches.filter((match) => match.eventType === "live");
	const freshLiveIds = new Set(freshLive.map((match) => match.id));
	const mergedLive = freshLive.map((fresh) => {
		const current = currentById.get(fresh.id);
		const merged = { ...current, ...fresh };
		if (current?.h2h && !fresh.h2h) {
			merged.h2h = current.h2h;
		}
		if (!fresh.youtubeUrl) {
			merged.youtubeUrl = isDirectYoutubeUrl(current?.youtubeUrl)
				? current.youtubeUrl
				: "";
		}
		return merged;
	});
	const scheduled = currentMatches.filter(
		(match) => match.eventType === "scheduled" && !freshLiveIds.has(match.id),
	);
	return [...mergedLive, ...scheduled];
}

function isDirectYoutubeUrl(value) {
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

function compareStartTime(left, right) {
	return String(left.startTime || "\uffff").localeCompare(
		String(right.startTime || "\uffff"),
	);
}
