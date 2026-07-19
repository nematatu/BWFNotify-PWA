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
			onKeyDown={(e) => {
				if (e.key === "Escape") props.onCancel();
			}}
		>
			<section
				class="install-sheet permission-sheet"
				role="dialog"
				aria-modal="true"
				aria-labelledby="permission-heading"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") e.stopPropagation();
				}}
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
