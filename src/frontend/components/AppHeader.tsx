import { formatDate } from "../lib/format";

export function AppHeader(props: {
	checkedAt: string | null;
	hasError: boolean;
}) {
	return (
		<header class="app-header">
			<div class="brand-lockup">
				<span class="brand-name">BWF</span>
				<div>
					<h1>ライブスコア</h1>
					<p>日本人選手</p>
				</div>
			</div>
			<p id="last-updated" class={props.hasError ? "error" : ""}>
				{props.checkedAt ? `更新: ${formatDate(props.checkedAt)}` : "未取得"}
			</p>
		</header>
	);
}
