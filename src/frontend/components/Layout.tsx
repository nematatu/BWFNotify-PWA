import { Show } from "solid-js";
import { checkedAt } from "../lib/matchesState";
import { notifError } from "../lib/pushNotificationState";
import { bannerHidden, openInstall } from "../lib/pwaInstallState";
import { formatDate, isInAppBrowser } from "../lib/utils";

// ==========================================
// AppHeader Component
// ==========================================
export function AppHeader() {
	return (
		<header class="app-header">
			<div class="brand-lockup">
				<span class="brand-name">BWF</span>
				<div>
					<h1>ライブスコア</h1>
					<p>日本人選手</p>
				</div>
			</div>
			<p id="last-updated" class={notifError() ? "error" : ""}>
				{checkedAt() ? `更新: ${formatDate(checkedAt()!)}` : "未取得"}
			</p>
		</header>
	);
}

// ==========================================
// AppFooter Component
// ==========================================
export function AppFooter() {
	return (
		<footer class="app-footer">
			<p class="footer-links">
				<a
					href="https://github.com/nematatu/BWFNotify-PWA"
					target="_blank"
					rel="noopener noreferrer"
				>
					GitHubリポジトリ
				</a>
				<span class="divider">/</span>
				<a
					href="https://x.com/nematatu"
					target="_blank"
					rel="noopener noreferrer"
				>
					開発者X (Twitter)
				</a>
			</p>
			<p class="footer-message">
				💡
				コントリビューション大歓迎です！不具合やご要望があれば、XのDMまたはGitHubのIssueまでお気軽お知らせください。
			</p>
		</footer>
	);
}

// ==========================================
// PwaBanner Component
// ==========================================
export function PwaBanner() {
	const inApp = isInAppBrowser();

	return (
		<Show when={!bannerHidden()}>
			<div
				id="pwa-guide-banner"
				class={`pwa-guide-banner ${inApp ? "in-app" : ""}`}
			>
				<div class="pwa-guide-content">
					<span class="pwa-guide-icon">{inApp ? "⚠️" : "💡"}</span>
					<p class="pwa-guide-text">
						{inApp ? (
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
				<Show when={!inApp}>
					<button
						id="pwa-guide-button"
						class="pwa-guide-button"
						type="button"
						onClick={openInstall}
					>
						追加方法を見る
					</button>
				</Show>
			</div>
		</Show>
	);
}
