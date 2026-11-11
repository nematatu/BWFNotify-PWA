import { type JSX, onMount, Show } from "solid-js";
import { AppFooter, AppHeader, PwaBanner } from "./components/Layout";
import { MatchList, MatchToolbar } from "./components/Matches";
import {
	BlockedPermissionOverlay,
	InstallOverlay,
	NotificationSettings,
	PermissionOverlay,
} from "./components/Notifications";
import { RecentResults } from "./components/RecentResults";
import { UpcomingSchedule } from "./components/Schedule";
import { initMatchesState } from "./lib/matchesState";
import {
	initNotifications,
	permissionBlockedOpen,
	permissionOpen,
} from "./lib/pushNotificationState";
import { installOpen, showInstallBannerIfNeeded } from "./lib/pwaInstallState";
import {
	isPanelMounted,
	isPanelVisible,
	type Panel,
	trackViewPanels,
} from "./lib/viewPanels";

export default function App() {
	trackViewPanels();
	onMount(() => {
		initMatchesState();
		void initNotifications();
		showInstallBannerIfNeeded();
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
					<ViewPanel panel="live">
						<MatchList eventType="live" />
					</ViewPanel>
					<ViewPanel panel="scheduled">
						<MatchList eventType="scheduled" />
					</ViewPanel>
					<ViewPanel panel="results">
						<RecentResults />
					</ViewPanel>
					<ViewPanel panel="upcoming">
						<UpcomingSchedule />
					</ViewPanel>
				</section>
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

/**
 * タブの中身。一度作った画面は、タブを切り替えても作り直さずに隠すだけにする。
 * 結果タブは試合数が多く、切り替えのたびに作り直すと表示まで待たされるため。
 */
function ViewPanel(props: { panel: Panel; children: JSX.Element }) {
	return (
		<Show when={isPanelMounted(props.panel)}>
			<div
				class="view-panel"
				data-panel={props.panel}
				hidden={!isPanelVisible(props.panel)}
			>
				{props.children}
			</div>
		</Show>
	);
}
