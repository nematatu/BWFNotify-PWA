export function MatchToolbar(props: {
	view: "live" | "scheduled";
	liveCount: number;
	scheduledCount: number;
	sortOrder: string;
	onViewChange: (view: "live" | "scheduled") => void;
	onSortChange: (order: string) => void;
	onRefresh: () => void;
}) {
	return (
		<div class="match-toolbar">
			<div class="match-tabs" role="tablist" aria-label="試合状態">
				<button
					id="live-tab"
					class="match-tab"
					type="button"
					role="tab"
					aria-selected={props.view === "live" ? "true" : "false"}
					onClick={() => props.onViewChange("live")}
				>
					ライブ <span id="live-count">{props.liveCount}</span>
				</button>
				<button
					id="scheduled-tab"
					class="match-tab"
					type="button"
					role="tab"
					aria-selected={props.view === "scheduled" ? "true" : "false"}
					onClick={() => props.onViewChange("scheduled")}
				>
					このあと <span id="scheduled-count">{props.scheduledCount}</span>
				</button>
			</div>
			<div class="match-controls">
				<label class="visually-hidden" for="sort-order">
					ソート順
				</label>
				<select
					id="sort-order"
					aria-label="ソート順"
					value={props.sortOrder}
					onChange={(e) => props.onSortChange(e.target.value)}
				>
					<option value="time-asc">時間が早い順</option>
					<option value="time-desc">時間が遅い順</option>
					<option value="tournament">大会名順</option>
				</select>
				<button id="refresh-button" type="button" onClick={props.onRefresh}>
					再読み込み
				</button>
			</div>
		</div>
	);
}
