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

function compareStartTime(left, right) {
	return String(left.startTime || "\uffff").localeCompare(
		String(right.startTime || "\uffff"),
	);
}
