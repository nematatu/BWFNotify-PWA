import { Show } from "solid-js";

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
			onKeyDown={(e) => {
				if (e.key === "Escape") props.onClose();
			}}
		>
			<section
				class="install-sheet"
				role="dialog"
				aria-modal="true"
				aria-labelledby="install-overlay-heading"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") e.stopPropagation();
				}}
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
