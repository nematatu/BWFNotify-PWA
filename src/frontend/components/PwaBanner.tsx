import { Show } from "solid-js";

export function PwaBanner(props: {
	hidden: boolean;
	inApp: boolean;
	onShowInstall: () => void;
}) {
	return (
		<Show when={!props.hidden}>
			<div
				id="pwa-guide-banner"
				class={`pwa-guide-banner ${props.inApp ? "in-app" : ""}`}
			>
				<div class="pwa-guide-content">
					<span class="pwa-guide-icon">{props.inApp ? "⚠️" : "💡"}</span>
					<p class="pwa-guide-text">
						{props.inApp ? (
							<>
								現在、アプリ内ブラウザ（XやYouTube等）で開いています。
								<strong>
									プッシュ通知を設定するには、SafariやChromeなどの標準ブラウザで開き直してください。
								</strong>
							</>
						) : (
							<>
								ホーム画面に追加すると、
								<strong>日本人選手の試合開始をプッシュ通知で受信</strong>
								できるようになります！
							</>
						)}
					</p>
				</div>
				<Show when={!props.inApp}>
					<button
						id="pwa-guide-button"
						class="pwa-guide-button"
						type="button"
						onClick={props.onShowInstall}
					>
						追加方法を見る
					</button>
				</Show>
			</div>
		</Show>
	);
}
