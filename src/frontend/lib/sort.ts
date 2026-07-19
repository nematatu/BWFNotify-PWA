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
