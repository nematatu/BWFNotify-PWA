export function NotificationSettings(props: {
	text: string;
	error: boolean;
	testDisabled: boolean;
	toggleChecked: boolean;
	toggleDisabled: boolean;
	standalone: boolean;
	inApp: boolean;
	onTest: () => void;
	onToggleClick: (e: Event) => void;
	onToggleChange: (e: Event) => void;
	onShowInstall: () => void;
}) {
	const handleSectionClick = () => {
		if (!props.standalone && !props.inApp) props.onShowInstall();
	};

	return (
		<section
			class="notification-settings"
			aria-labelledby="notification-heading"
			onClick={handleSectionClick}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") handleSectionClick();
			}}
		>
			<div>
				<h2 id="notification-heading">通知</h2>
				<p
					id="notification-status"
					role="status"
					class={props.error ? "error" : ""}
				>
					{props.text}
				</p>
			</div>
			<fieldset
				class="notification-controls"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") e.stopPropagation();
				}}
			>
				<button
					id="test-notification-button"
					type="button"
					disabled={props.testDisabled}
					onClick={props.onTest}
				>
					テスト通知
				</button>
				<label class="switch">
					<span class="visually-hidden">プッシュ通知</span>
					<input
						id="notification-toggle"
						type="checkbox"
						disabled={props.toggleDisabled}
						checked={props.toggleChecked}
						onClick={props.onToggleClick}
						onChange={props.onToggleChange}
					/>
					<span class="switch-track" aria-hidden="true" />
				</label>
			</fieldset>
		</section>
	);
}
