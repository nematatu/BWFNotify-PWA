import { onMount, Show } from "solid-js";
import { AppFooter, AppHeader, PwaBanner } from "./components/Layout";
import { MatchList, MatchToolbar } from "./components/Matches";
import {
	BlockedPermissionOverlay,
	InstallOverlay,
	NotificationSettings,
	PermissionOverlay,
} from "./components/Notifications";
import { RecentResults, UpcomingSchedule } from "./components/Schedule";
import { initMatchesState } from "./lib/matchesState";
import {
	initNotifications,
	permissionBlockedOpen,
	permissionOpen,
} from "./lib/pushNotificationState";
import {
	installOpen,
	setBannerHidden,
	standalone,
} from "./lib/pwaInstallState";
import { isMobileBrowser } from "./lib/utils";

export default function App() {
	onMount(() => {
		initMatchesState();
		void initNotifications();
		if (!standalone() && isMobileBrowser()) {
			setBannerHidden(false);
		}
	});

	return (
		<div>
			<main>
				<AppHeader />
				<PwaBanner />
				<NotificationSettings />
				<section class="matches" aria-labelledby="matches-heading">
					<h2 id="matches-heading" class="visually-hidden">
						試合
					</h2>
					<MatchToolbar />
					<MatchList />
				</section>
				<RecentResults />
				<UpcomingSchedule />
				<AppFooter />
			</main>

			<Show when={installOpen()}>
				<InstallOverlay />
			</Show>

			<Show when={permissionOpen()}>
				<PermissionOverlay />
			</Show>

			<Show when={permissionBlockedOpen()}>
				<BlockedPermissionOverlay />
			</Show>
		</div>
	);
}
