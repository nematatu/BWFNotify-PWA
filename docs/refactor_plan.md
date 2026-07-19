# コード品質・パフォーマンス・UX 包括的改善計画

## 改善の概要

全ファイルを調査した結果、以下のカテゴリで改善点を特定しました。

---

## 特定した問題点

### 🗑️ 死んでいるコード (Dead Code)

| 場所 | 内容 |
|---|---|
| `src/api/bwf.ts` L145 | `status` フィールドを `displayStatus(match)` で設定しているが、UIもAPIも `match.status` を一切参照しない |
| `src/api/bwf.ts` L559-575 | `displayStatus()` 関数 — 未使用 |
| `src/type/index.ts` L97 | `MatchSummary.status: string` フィールド |
| `src/api/bwf.ts` | `tournament.link` を `BwfMatch.tournamentLink` に設定しているが `MatchSummary` に存在せず誰も使わない |
| `src/type/index.ts` L24 | `BwfMatch.tournamentLink?: string` フィールド |

### ⚡ パフォーマンス

| 場所 | 内容 |
|---|---|
| `public/view/app.js` | `formatPreviousDate`・`formatMatchTime`・`formatDate` が毎回 `new Intl.DateTimeFormat(...)` を生成 → モジュールトップでキャッシュ |
| `public/view/app.js` | `proxiedImageUrl()` が毎回 `new URL()` を生成 → テンプレートリテラルに |
| `src/api/bwf.ts` | `headerOptions` 配列を `fetchBwfJson` 呼び出しごとに生成 → モジュール定数に |
| `public/index.html` | `modulepreload` がなく、モジュールグラフの並列ダウンロードが遅い |

### 🔒 セキュリティ/UX

| 場所 | 内容 |
|---|---|
| `public/view/app.js` | `api()` にタイムアウトなし → ネットワーク障害時に永久にハング |
| `public/view/app.js` | `appinstalled` イベントで `hideInstallOverlay(true)` を渡していない → インストール完了後も内部フラグが立たない |

### 📦 コード簡略化

| 場所 | 内容 |
|---|---|
| `public/view/app.js` | `displayRound()` の Object リテラル辞書 → `Map` で同等の処理をより明示的に |

---

## Implementation Checklist

- [ ] `MatchSummary.status` 削除 (`src/type/index.ts`)
- [ ] `BwfMatch.tournamentLink` 削除 (`src/type/index.ts`)
- [ ] `displayStatus()` 関数削除 (`src/api/bwf.ts`)
- [ ] `status: ...` フィールド代入削除 (`src/api/bwf.ts`)
- [ ] `tournamentLink: tournament.link` 削除 (`src/api/bwf.ts`)
- [ ] `BWF_FETCH_HEADERS` 定数抽出 (`src/api/bwf.ts`)
- [ ] `FMT_DATE_MEDIUM`・`FMT_DATETIME` 定数化 (`public/view/app.js`)
- [ ] `proxiedImageUrl` 最適化 (`public/view/app.js`)
- [ ] `api()` タイムアウト 15秒追加 (`public/view/app.js`)
- [ ] `appinstalled` で `hideInstallOverlay(true)` 呼び出し (`public/view/app.js`)
- [ ] `ROUND_MAP` 化 (`public/view/app.js`)
- [ ] `modulepreload` 追加 (`public/index.html`)
- [ ] `Vary: Accept` ヘッダー追加 (`src/api/media.ts`)
- [ ] テストデータ更新 (`integration/worker.integration.test.ts`, `test/bwf.test.ts`)
- [ ] precommit 全件パス
- [ ] commit & push

---

## Code Changes (詳細)

### [1] src/type/index.ts

```diff
 export type BwfMatch = {
   id: string;
   tournamentName?: string;
   tournamentLogoUrl?: string;
   tournamentHeaderImageUrl?: string;
   tournamentHeaderImageMobileUrl?: string;
   tournamentCategory?: string;
-  tournamentLink?: string;
   matchStatus?: string;
```

```diff
 export type MatchSummary = {
   id: string;
   tournament: string;
   // ...
   eventType: "live" | "scheduled";
-  status: string;
   round?: string;
```

### [2] src/api/bwf.ts

```diff
+const BWF_FETCH_HEADERS: HeadersInit[] = [
+  {
+    accept: "application/json,text/plain,*/*;q=0.9",
+    "accept-language": "en-US,en;q=0.9",
+    referer: "https://bwfbadminton.com/",
+    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) ...",
+  },
+  { accept: "application/json,text/plain,*/*;q=0.9" },
+];
 
 // ... fetchBwfJson: headerOptions を BWF_FETCH_HEADERS で置き換え
```

```diff
-  tournamentLink: tournament.link,   // parseMatch 内から削除
```

```diff
-  status: type === "live" ? displayStatus(match) : "",  // 削除
```

```diff
-function displayStatus(match: BwfMatch): string {
-  return (
-    statusCandidates(match).find((status) => status.toLowerCase() !== "none") ||
-    "Live"
-  );
-}
```

### [3] public/view/app.js

```diff
+// Reuse expensive formatters
+const FMT_DATE_MEDIUM = new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium" });
+const FMT_DATETIME = new Intl.DateTimeFormat("ja-JP", {
+  month: "numeric",
+  day: "numeric",
+  hour: "2-digit",
+  minute: "2-digit",
+});

 // ...

 async function api(path, options = {}) {
+  const ac = new AbortController();
+  const timer = setTimeout(() => ac.abort(), 15_000);
   const response = await fetch(path, {
     ...options,
     headers: { ... },
+    signal: ac.signal,
   });
+  clearTimeout(timer);
   // ...
 }

 // ...

-const labels = { FINAL: "決勝", ... };
-if (labels[normalized]) return labels[normalized];
+const ROUND_MAP = new Map([["F", "決勝"], ["FINAL", "決勝"], ["FINALS", "決勝"],
+  ["SF", "準決勝"], ["SEMIFINAL", "準決勝"], ["SEMI FINAL", "準決勝"],
+  ["QF", "準々決勝"], ["QUARTERFINAL", "準々決勝"], ["QUARTER FINAL", "準々決勝"]]);
+const roundLabel = ROUND_MAP.get(normalized);
+if (roundLabel) return roundLabel;

 // ...

 function proxiedImageUrl(value) {
   const url = safeHttpsUrl(value);
   if (!url) return null;
-  const source = new URL("/api/media", window.location.origin);
-  source.searchParams.set("url", url.toString());
-  return source.toString();
+  return `/api/media?url=${encodeURIComponent(url.toString())}`;
 }

 // ...

-  : new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium" }).format(date);
+  : FMT_DATE_MEDIUM.format(date);

-  return new Intl.DateTimeFormat("ja-JP", { month: "numeric", ...}).format(date);
+  return FMT_DATETIME.format(date);
```

### [4] public/index.html

```diff
+<link rel="modulepreload" href="/view/app.js?v=39" />
+<link rel="modulepreload" href="/view/match-groups.js?v=39" />
 <script type="module" src="/view/app.js?v=39"></script>
```

### [5] src/api/media.ts

```diff
 const headers = new Headers({
   "Cache-Control": "public, max-age=86400",
+  "Vary": "Accept",
   "Content-Type": contentType,
```

> [!NOTE]
> `MatchSummary.status` 削除後、既存KVデータには `status` フィールドが残りますが、TypeScript型が削除されても実データはそのまま読み込まれます。UIは `status` を参照しないため、視覚的な変化はありません。

> [!IMPORTANT]
> `appinstalled` イベントのバグ修正: `hideInstallOverlay()` が `dismiss=false` のまま呼ばれていたため、PWAインストール後にオーバーレイが再表示される可能性があります。修正後は `hideInstallOverlay(true)` で sessionStorage に記録します。
