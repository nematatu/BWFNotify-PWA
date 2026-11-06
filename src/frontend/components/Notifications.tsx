import { type JSX, Show } from "solid-js";
import { isInAppBrowser } from "../lib/browser";
import {
	cancelPermission,
	closeBlockedPermission,
	confirmPermission,
	notifError,
	notifText,
	onToggleChange,
	onToggleClick,
	retryNotificationPermission,
	sendTest,
	testDisabled,
	toggleChecked,
	toggleDisabled,
} from "../lib/pushNotificationState";
import {
	closeInstall,
	guidance,
	handleInstall,
	openInstall,
	standalone,
} from "../lib/pwaInstallState";

export function InstallOverlay() {
	// インストールを断られた場合は「今はブラウザで見る」へフォーカスを戻す。
	let dismissButton: HTMLButtonElement | undefined;

	return (
		<OverlaySheet
			id="install-overlay"
			labelledBy="install-overlay-heading"
			onClose={closeInstall}
		>
			<button
				id="install-overlay-close"
				class="install-overlay-close"
				type="button"
				aria-label="案内を閉じる"
				onClick={closeInstall}
			>
				×
			</button>
			<p class="overlay-step-count">通知を使うまで 3ステップ</p>
			<h2 id="install-overlay-heading">ホーム画面から開いてください</h2>
			<ol class="install-steps">
				<li>
					<strong id="install-step-title">{guidance().title}</strong>
					<span id="install-step-description">{guidance().description}</span>
				</li>
				<li>
					<strong>追加したアイコンから起動</strong>
					<span>ブラウザを閉じても試合情報を確認できます。</span>
				</li>
				<li>
					<strong>通知をオン</strong>
					<span>許可画面は、内容を説明したあとに一度だけ表示します。</span>
				</li>
			</ol>
			<p class="install-assurance">
				通知対象は日本人選手の試合開始です。試合ごとに後から解除できます。
			</p>
			<div class="install-actions">
				<Show when={guidance().hasAction}>
					<button
						id="install-action"
						class="primary-action"
						type="button"
						onClick={() => handleInstall(dismissButton)}
					>
						ホーム画面に追加
					</button>
				</Show>
				<button ref={dismissButton} type="button" onClick={closeInstall}>
					今はブラウザで見る
				</button>
			</div>
		</OverlaySheet>
	);
}

export function PermissionOverlay() {
	return (
		<OverlaySheet
			id="permission-overlay"
			sheetClass="permission-sheet"
			labelledBy="permission-heading"
			onClose={cancelPermission}
		>
			<p class="overlay-step-count">通知許可の前に</p>
			<h2 id="permission-heading">試合開始を通知します</h2>
			<div class="permission-summary">
				<p>
					<strong>通知する</strong> 日本人選手の対象試合が始まったとき
				</p>
				<p>
					<strong>通知しない</strong> 得点更新、広告、ニュース
				</p>
			</div>
			<p class="permission-note">
				次にブラウザの許可画面が表示されます。拒否しても試合情報はそのまま利用できます。
			</p>
			<div class="permission-actions">
				<button id="permission-cancel" type="button" onClick={cancelPermission}>
					キャンセル
				</button>
				<button
					id="permission-confirm"
					class="primary-action"
					type="button"
					onClick={confirmPermission}
				>
					通知を許可する
				</button>
			</div>
		</OverlaySheet>
	);
}

export function BlockedPermissionOverlay() {
	return (
		<OverlaySheet
			id="blocked-permission-overlay"
			sheetClass="permission-sheet"
			labelledBy="blocked-permission-heading"
			onClose={closeBlockedPermission}
		>
			<p class="overlay-step-count">通知がブロックされています</p>
			<h2 id="blocked-permission-heading">通知の許可を変更してください</h2>
			<p class="permission-note">
				端末またはブラウザのサイト設定で、このサイトの通知を「許可」に変更してください。変更後に再確認すると通知をオンにできます。
			</p>
			<div class="permission-actions">
				<button type="button" onClick={closeBlockedPermission}>
					閉じる
				</button>
				<button
					id="blocked-permission-retry"
					class="primary-action"
					type="button"
					onClick={retryNotificationPermission}
				>
					再確認
				</button>
			</div>
		</OverlaySheet>
	);
}

export function NotificationSettings() {
	const inApp = isInAppBrowser();

	// 通知欄を押したら、ホーム画面版でない利用者へ追加方法を案内する。
	const handleSectionClick = () => {
		if (!standalone() && !inApp) openInstall();
	};

	return (
		<section
			class="notification-settings"
			aria-labelledby="notification-heading"
			onClick={handleSectionClick}
			onKeyDown={(event) =>
				(event.key === "Enter" || event.key === " ") && handleSectionClick()
			}
		>
			<div>
				<h2 id="notification-heading">通知</h2>
				<p
					id="notification-status"
					role="status"
					class={notifError() ? "error" : ""}
				>
					{notifText()}
				</p>
			</div>
			<fieldset
				class="notification-controls"
				onClick={(event) => event.stopPropagation()}
				onKeyDown={(event) =>
					(event.key === "Enter" || event.key === " ") &&
					event.stopPropagation()
				}
			>
				<button
					id="test-notification-button"
					type="button"
					disabled={testDisabled()}
					onClick={sendTest}
				>
					テスト通知
				</button>
				<label class="switch">
					<span class="visually-hidden">プッシュ通知</span>
					<input
						id="notification-toggle"
						type="checkbox"
						disabled={toggleDisabled()}
						checked={toggleChecked()}
						onClick={onToggleClick}
						onChange={onToggleChange}
					/>
					<span class="switch-track" aria-hidden="true" />
				</label>
			</fieldset>
		</section>
	);
}

/** 背景クリックとEscapeで閉じる下部シート。シート内の操作は背景へ伝えない。 */
function OverlaySheet(props: {
	id: string;
	sheetClass?: string;
	labelledBy: string;
	onClose: () => void;
	children: JSX.Element;
}) {
	return (
		<div
			id={props.id}
			class="install-overlay"
			onClick={() => props.onClose()}
			role="dialog"
			tabIndex={-1}
			onKeyDown={(event) => event.key === "Escape" && props.onClose()}
		>
			<section
				class={
					props.sheetClass
						? `install-sheet ${props.sheetClass}`
						: "install-sheet"
				}
				role="dialog"
				aria-modal="true"
				aria-labelledby={props.labelledBy}
				onClick={(event) => event.stopPropagation()}
				onKeyDown={(event) => event.stopPropagation()}
			>
				{props.children}
			</section>
		</div>
	);
}
