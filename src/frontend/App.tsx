import { createSignal, onMount, Show } from "solid-js";
import { AppFooter, AppHeader, PwaBanner } from "./components/Layout";
import { MatchList, MatchToolbar } from "./components/Matches";
import {
	InstallOverlay,
	NotificationSettings,
	PermissionOverlay,
} from "./components/Notifications";
import { useMatches } from "./lib/useMatches";
import { usePushNotifications } from "./lib/usePushNotifications";
import { usePwaInstall } from "./lib/usePwaInstall";
import {
	AppContext,
	DEFAULT_SORT_ORDER,
	isMobileBrowser,
	isValidSortOrder,
	type SortOrder,
} from "./lib/utils";

export default function App() {
	// --- View State ---
	const [currentView, setCurrentView] = createSignal<"live" | "scheduled">(
		"live",
	);
	const [sortOrder, setSortOrder] = createSignal<SortOrder>(
		readSavedSort() || DEFAULT_SORT_ORDER,
	);
	const [permissionOpen, setPermissionOpen] = createSignal(false);
	const [toggleChecked, setToggleChecked] = createSignal(false);

	let dismissBtn: HTMLButtonElement | undefined;

	// --- Custom Hooks ---
	const { matches, checkedAt, refreshAll } = useMatches();

	const {
		installPrompt,
		setInstallPrompt,
		installOpen,
		openInstall,
		closeInstall,
		bannerHidden,
		setBannerHidden,
		guidance,
		standalone,
	} = usePwaInstall();

	const {
		notifText,
		notifError,
		testDisabled,
		toggleDisabled,
		excludedIds,
		notificationDisabled,
		initNotifications,
		updateSubscription,
		sendTest,
		updateMatchNotif,
	} = usePushNotifications(setToggleChecked);

	onMount(() => {
		void initNotifications();
		if (!standalone() && isMobileBrowser()) {
			setBannerHidden(false);
		}
	});

	function closePermission() {
		setPermissionOpen(false);
		document.body.classList.remove("overlay-open");
	}

	async function handleInstall() {
		const prompt = installPrompt();
		if (!prompt) return;
		try {
			await prompt.prompt();
			const choice = await prompt.userChoice;
			setInstallPrompt(null);
			if (choice?.outcome === "accepted") closeInstall();
			else dismissBtn?.focus();
		} catch (e) {
			console.error("Install prompt error:", e);
		}
	}

	function handleSortChange(order: SortOrder) {
		localStorage.setItem("bwf-sort-order", order);
		setSortOrder(order);
	}

	// --- Orchestrated Toggle Click Event Handler ---
	function onToggleClick(e: Event) {
		if (!standalone()) {
			e.preventDefault();
			openInstall();
			return;
		}
		if (
			!toggleChecked() &&
			"Notification" in window &&
			Notification.permission === "default"
		) {
			e.preventDefault();
			setPermissionOpen(true);
			document.body.classList.add("overlay-open");
		}
	}

	// --- Orchestrated Toggle Change Event Handler ---
	function onToggleChange(e: Event) {
		if (!standalone()) return;
		void updateSubscription((e.target as HTMLInputElement).checked);
	}

	// --- Orchestrated App State Context ---
	const appState = {
		matches,
		excludedMatchIds: excludedIds,
		notificationDisabled,
		onNotificationChange: updateMatchNotif,
		sortOrder,
		setSortOrder: handleSortChange,
		currentView,
		setCurrentView,
		loadStatus: refreshAll,

		// Notification and Install context
		notifText,
		notifError,
		testDisabled,
		toggleChecked,
		toggleDisabled,
		standalone,
		inApp: () => false,
		onTest: sendTest,
		onToggleClick,
		onToggleChange,
		onShowInstall: openInstall,
	};

	return (
		<AppContext.Provider value={appState}>
			<div>
				<main>
					<AppHeader checkedAt={checkedAt()} hasError={notifError()} />
					<PwaBanner
						hidden={bannerHidden()}
						inApp={false}
						onShowInstall={openInstall}
					/>
					<NotificationSettings />
					<section class="matches" aria-labelledby="matches-heading">
						<h2 id="matches-heading" class="visually-hidden">
							試合
						</h2>
						<MatchToolbar />
						<MatchList />
					</section>
					<AppFooter />
				</main>

				<Show when={installOpen()}>
					<InstallOverlay
						guidance={guidance()}
						onClose={() => closeInstall(true)}
						onInstall={handleInstall}
						dismissRef={(el) => {
							dismissBtn = el;
						}}
					/>
				</Show>

				<Show when={permissionOpen()}>
					<PermissionOverlay
						onCancel={() => {
							closePermission();
							setToggleChecked(false);
						}}
						onConfirm={() => {
							closePermission();
							setToggleChecked(true);
							void updateSubscription(true);
						}}
					/>
				</Show>
			</div>
		</AppContext.Provider>
	);
}

function readSavedSort(): SortOrder | null {
	const saved = localStorage.getItem("bwf-sort-order");
	return isValidSortOrder(saved) ? saved : null;
}
