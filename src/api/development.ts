import productionWorker from "./app";
import { developmentPwaResponse } from "./developmentPwa";

export default {
	fetch(request, env, ctx) {
		const pathname = new URL(request.url).pathname;
		if (pathname === "/api" || pathname.startsWith("/api/")) {
			return productionWorker.fetch(request, env, ctx);
		}
		return developmentPwaResponse(request);
	},
	scheduled: productionWorker.scheduled,
} satisfies ExportedHandler<Env>;
