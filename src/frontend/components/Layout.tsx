import { BellRing, TriangleAlert } from "lucide-solid";
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
				<Show when={checkedAt()} fallback="未取得">
					{(value) => `更新: ${formatDate(value())}`}
				</Show>
			</p>
		</header>
	);
}

// ==========================================
// AppFooter Component
// ==========================================
function GitHubLogo() {
	return (
		<svg class="brand-icon" viewBox="0 0 24 24" aria-hidden="true">
			<path d="M12 .297a12 12 0 0 0-3.79 23.4c.6.113.82-.258.82-.577v-2.234c-3.338.726-4.042-1.61-4.042-1.61-.546-1.386-1.332-1.755-1.332-1.755-1.09-.744.083-.729.083-.729 1.205.084 1.84 1.237 1.84 1.237 1.07 1.835 2.809 1.305 3.495.998.108-.776.418-1.305.762-1.605-2.665-.3-5.467-1.332-5.467-5.93 0-1.31.468-2.382 1.236-3.222-.123-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.3 1.23a11.5 11.5 0 0 1 6.006 0c2.29-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.119 3.176.77.84 1.235 1.911 1.235 3.222 0 4.61-2.807 5.625-5.48 5.921.43.372.814 1.103.814 2.222v3.293c0 .32.216.694.825.576A12 12 0 0 0 12 .297" />
		</svg>
	);
}

function XLogo() {
	return (
		<svg class="brand-icon" viewBox="0 0 24 24" aria-hidden="true">
			<path d="M18.244 2.25h3.308l-7.227 8.26 8.495 11.24h-6.65l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
		</svg>
	);
}

export function AppFooter() {
	return (
		<footer class="app-footer">
			<nav class="footer-links" aria-label="関連リンク">
				<a
					href="https://github.com/nematatu/BWFNotify-PWA"
					target="_blank"
					rel="noopener noreferrer"
					aria-label="GitHubリポジトリ"
					title="GitHubリポジトリ"
				>
					<GitHubLogo />
				</a>
				<a
					href="https://x.com/nematatu"
					target="_blank"
					rel="noopener noreferrer"
					aria-label="開発者のX"
					title="開発者のX"
				>
					<XLogo />
				</a>
			</nav>
			<p class="footer-message">
				不具合・要望・改善提案は、GitHub IssueまたはXのDMへお寄せください。
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
					<span class="pwa-guide-icon" aria-hidden="true">
						{inApp ? <TriangleAlert size={20} /> : <BellRing size={20} />}
					</span>
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
