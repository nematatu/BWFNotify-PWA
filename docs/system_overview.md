# システム概要

この文書は現在のコード構成と運用上の制約を説明します。実測していない削減率や、実機で確認していない動作を完了事項として扱いません。

## 処理の流れ

```text
Cloudflare Cron（2分間隔）
  -> BWF Match Centreから大会・試合を取得
  -> 日本人選手の試合を抽出・正規化
  -> H2Hと公式YouTube配信候補を解決
  -> 変更時または5分経過時だけ試合状態をKVへ保存
  -> 新しくライブになった試合を購読者へ通知

ブラウザ
  -> /api/statusで保存済み状態を2分間隔で取得
  -> ライブ試合がある間だけ/api/liveを15秒間隔で取得
  -> 非表示または5分無操作で取得を停止
```

## 責務

### フロントエンド

- `src/frontend/components/`: 表示と操作
- `src/frontend/lib/matchesState.ts`: 試合状態と更新ライフサイクル
- `src/frontend/lib/pollingPolicy.ts`: 停止・通常・ライブ更新の純粋な判定
- `src/frontend/lib/pushNotificationState.ts`: Push購読と試合別除外設定
- `src/frontend/pwa/sw.js`: オフラインキャッシュとPush表示

試合カードでは、ライブ状態または開始時刻、配信リンク、選手、得点を主情報とします。大会名、ラウンド、コート、H2H、前回対戦は補助情報です。日本人チームはAPI正規化時に先頭へ移動します。

### Worker API

- `src/api/app.ts`: HTTPルートとCronのオーケストレーション
- `src/api/bwf.ts`: BWFへのHTTP取得と処理の組み立て
- `src/api/bwfMatch.ts`: 試合状態判定と日本人試合の正規化
- `src/api/bwfH2h.ts`: H2H取得、キャッシュ、レスポンス解析
- `src/api/youtube.ts`: YouTube候補取得、メタデータ取得、Cache API
- `src/api/youtubeMatch.ts`: URL、公式配信元、タイトルの照合
- `src/api/push.ts`: 購読保存、除外適用、Web Push送信
- `src/api/media.ts`: 許可したBWF画像の中継

外部レスポンスを扱う処理と、入力から結果を返す純粋処理を分けています。外部形式の変更は取得・解析側で吸収し、UIや通知処理へ未知の形式を渡しません。

## 通知契約

通知APIの型は `src/type/index.ts` でフロントエンドとWorkerが共有します。

- 購読登録: `{ subscription }`
- 除外更新: `{ endpoint, excludedMatchIds }`
- テスト通知: `{ endpoint }`

全試合の通知が既定で有効です。利用者が外した試合IDだけを購読レコードへ保存します。複数試合を同時に通知する場合、送信結果は試合単位で記録し、全送信が失敗した試合だけを最大3回まで再試行します。部分成功は、受信済み購読者への重複を避けるため再送しません。

## 保存とキャッシュ

KVには次のデータを保存します。

- 最新の試合状態と通知済み試合
- Push購読と試合別除外
- H2Hキャッシュ

購読一覧はKVのlist結果に含まれるmetadataを利用します。metadataは送信に必要な値だけを短縮キーで保存し、JSON表現が[Cloudflareの1024バイト上限](https://developers.cloudflare.com/kv/platform/limits/)を超える場合はmetadataを付けず、送信時にそのレコードだけ個別getへフォールバックします。KVの利用量はCloudflare側のメトリクスで確認し、固定の削減率は文書上で保証しません。

YouTubeの候補ページ、動画メタデータ、試合ごとの解決結果はCache APIへ保存します。配信が見つからない結果も期限付きで保存するため、画面アクセスごとにYouTubeを検索しません。直接URLが確認できない試合にはリンクを表示しません。

## PWA

本番ビルド時だけManifestとApple向けPWAメタデータをHTMLへ追加し、ハッシュ付きJS/CSSをService Workerのアプリシェルへ埋め込みます。本番通知では日本人選手写真を`image`と`icon`へ設定し、写真がない場合はアプリアイコンへフォールバックします。

開発時はPWAを完全に無効化します。5173ではManifestを追加せず、起動時に同一オリジンのService Worker登録とCache Storageを削除します。`/pwa/sw.js`へアクセスされても、キャッシュやPush処理を持たず自身を解除する移行用Workerだけを返します。

8787は`wrangler.dev.jsonc`と`src/api/development.ts`でAPI専用Workerとして起動し、`dist`の本番静的アセットを読みません。過去に8787へ登録された本番Service Workerを除去するため、API以外のルートは`Clear-Site-Data`付きの解除ページ、`/pwa/sw.js`は自身を解除するWorkerを返します。これにより、開発サーバー終了後にオフラインシェルだけがlocalhostへ残る状態を防ぎます。

OGP画像は `public/pwa/og-image.png` の1200x630画像です。HTMLの寸法指定と実ファイル寸法を単体テストで確認します。

## 開発と検証

`bun run dev` はViteと開発API用Wranglerを同じ親プロセスで管理します。Worker起動後にscheduled処理を1回実行し、画面はlocalhost:5173、APIはlocalhost:8787で提供します。片方の異常終了またはCtrl+Cで両方を停止します。

`bun run precommit` は次を実行します。

1. Wrangler生成型の差分確認
2. TypeScript型検査
3. Biome
4. 単体テスト
5. Worker統合テスト
6. Playwrightレイアウト・更新遷移テスト
7. Playwright開発PWA解除テスト
8. Wrangler dry-run

GitHub Actionsでも同じコマンドを実行します。`main`へのpush後のデプロイはCloudflare側のパイプラインが担当します。

## 確認が必要な制約

- BWFの取得先は安定提供が保証された公開APIであることを確認できていません。形式変更をfixtureとログで検知する必要があります。
- YouTubeは地域制限、未配信、公式チャンネルやタイトル形式の変更により解決できない場合があります。
- iOSのWeb Pushはホーム画面へ追加したWebアプリから許可する必要があります。自動テストだけで実機配送を証明できないため、リリース前の実機確認対象です。
- KV metadataのサイズとlistページ数は購読数増加時に計測し、上限接近を監視する必要があります。
