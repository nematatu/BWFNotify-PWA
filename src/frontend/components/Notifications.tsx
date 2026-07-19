import { Show } from "solid-js";
import { useApp } from "../lib/utils";

// ==========================================
// 1. InstallOverlay Component
// ==========================================
export type InstallGuidance = {
	title: string;
	description: string;
	hasAction: boolean;
};

export function InstallOverlay(props: {
	guidance: InstallGuidance;
	onClose: () => void;
	onInstall: () => void;
	dismissRef?: (el: HTMLButtonElement) => void;
}) {
	return (
		<div
			id="install-overlay"
			class="install-overlay"
			onClick={props.onClose}
			role="dialog"
			tabIndex={-1}
			onKeyDown={(e) => e.key === "Escape" && props.onClose()}
		>
			<section
				class="install-sheet"
				role="dialog"
				aria-modal="true"
				aria-labelledby="install-overlay-heading"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => e.stopPropagation()}
			>
				<button
					id="install-overlay-close"
					class="install-overlay-close"
					type="button"
					aria-label="案内を閉じる"
					onClick={props.onClose}
				>
					×
				</button>
				<p class="overlay-step-count">通知を使うまで 3ステップ</p>
				<h2 id="install-overlay-heading">ホーム画面から開いてください</h2>
				<ol class="install-steps">
					<li>
						<strong id="install-step-title">{props.guidance.title}</strong>
						<span id="install-step-description">
							{props.guidance.description}
						</span>
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
					<Show when={props.guidance.hasAction}>
						<button
							id="install-action"
							class="primary-action"
							type="button"
							onClick={props.onInstall}
						>
							ホーム画面に追加
						</button>
					</Show>
					<button ref={props.dismissRef} type="button" onClick={props.onClose}>
						今はブラウザで見る
					</button>
				</div>
			</section>
		</div>
	);
}

// ==========================================
// 2. PermissionOverlay Component
// ==========================================
export function PermissionOverlay(props: {
	onCancel: () => void;
	onConfirm: () => void;
}) {
	return (
		<div
			id="permission-overlay"
			class="install-overlay"
			onClick={props.onCancel}
			role="dialog"
			tabIndex={-1}
			onKeyDown={(e) => e.key === "Escape" && props.onCancel()}
		>
			<section
				class="install-sheet permission-sheet"
				role="dialog"
				aria-modal="true"
				aria-labelledby="permission-heading"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => e.stopPropagation()}
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
					<button id="permission-cancel" type="button" onClick={props.onCancel}>
						キャンセル
					</button>
					<button
						id="permission-confirm"
						class="primary-action"
						type="button"
						onClick={props.onConfirm}
					>
						通知を許可する
					</button>
				</div>
			</section>
		</div>
	);
}

// ==========================================
// 3. NotificationSettings Component
// ==========================================
export function NotificationSettings() {
	const {
		notifText,
		notifError,
		testDisabled,
		toggleChecked,
		toggleDisabled,
		standalone,
		inApp,
		onTest,
		onToggleClick,
		onToggleChange,
		onShowInstall,
	} = useApp();

	const handleSectionClick = () => {
		if (!standalone() && !inApp()) onShowInstall();
	};

	return (
		<section
			class="notification-settings"
			aria-labelledby="notification-heading"
			onClick={handleSectionClick}
			onKeyDown={(e) =>
				(e.key === "Enter" || e.key === " ") && handleSectionClick()
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
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) =>
					(e.key === "Enter" || e.key === " ") && e.stopPropagation()
				}
			>
				<button
					id="test-notification-button"
					type="button"
					disabled={testDisabled()}
					onClick={onTest}
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
