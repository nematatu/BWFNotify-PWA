import { fetchUpcomingTournaments } from "../src/api/baj";

const now = new Date();
const tournaments = await fetchUpcomingTournaments(now);
const output = `${JSON.stringify({ generatedAt: now.toISOString(), tournaments }, null, "\t")}\n`;

await Bun.write(
	new URL("../config/upcoming-tournaments.json", import.meta.url),
	output,
);
console.log(`BAJ公式情報を更新しました: ${tournaments.length}大会`);
