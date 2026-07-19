import snapshot from "../config/upcoming-tournaments.json";
import { fetchUpcomingTournaments } from "../src/api/baj";
import type { UpcomingTournament } from "../src/type";

const now = new Date();
const tournaments = await fetchUpcomingTournaments(
	now,
	snapshot.tournaments as UpcomingTournament[],
	[],
);
const output = `${JSON.stringify({ generatedAt: now.toISOString(), tournaments }, null, "\t")}\n`;

await Bun.write(
	new URL("../config/upcoming-tournaments.json", import.meta.url),
	output,
);
console.log(`BAJ公式情報を更新しました: ${tournaments.length}大会`);
