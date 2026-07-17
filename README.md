# BWFNotify PWA

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

BWFのライブ試合を定期確認し、日本人選手が出場する試合をモバイル端末へWeb Pushで通知するCloudflare Workersアプリです。画面では通知の有効・無効と、現在の対象試合を確認できます。

## 構成

```text
Cloudflare Workers Cron
  -> BWF match endpoints
  -> 日本人選手のライブ試合を抽出
  -> Cloudflare KVで購読・状態・通知済み試合を管理
  -> Web Push
  -> PWA Service Worker
```

静的画面とService WorkerはWorkers Static Assetsから配信します。画面はビルド工程を持たないHTML、CSS、JavaScriptです。

```text
src/api/       BWF取得・Push・HTTP API
src/config/    日本人選手名などの設定
src/type/      共有TypeScript型
src/utils/     共有ユーティリティ
public/view/   画面のCSS・JavaScript
public/pwa/    Service Worker・Manifest・PWAアイコン
test/          API・Pushのテスト
```

## 必要なもの

- Cloudflareアカウント
- Bun
- Web Push対応ブラウザ

## セットアップ

依存関係をインストールします。

```sh
bun install
```

VAPID鍵を生成します。

```sh
bun run generate:vapid
cp .dev.vars.example .dev.vars
```

生成結果を `.dev.vars` の `VAPID_PUBLIC_KEY` と `VAPID_PRIVATE_KEY` に設定し、`VAPID_SUBJECT` には管理者へ連絡可能な `mailto:` URLまたはHTTPS URLを設定してください。`.dev.vars` はGit管理対象外です。

この設定にはPWA専用のKV Namespace IDが含まれています。別のCloudflareアカウントで利用する場合は、次のコマンドで本番用とプレビュー用のNamespaceを作成し、表示されたIDを `wrangler.jsonc` の `id` と `preview_id` へ設定してください。

```sh
bunx wrangler kv namespace create NOTIFIED_MATCHES
bunx wrangler kv namespace create NOTIFIED_MATCHES --preview
```

本番用Secretを対話形式で登録します。

```sh
bunx wrangler secret put VAPID_PUBLIC_KEY
bunx wrangler secret put VAPID_PRIVATE_KEY
bunx wrangler secret put VAPID_SUBJECT
```

## ローカル開発

```sh
bun run dev
```

`http://localhost:8787` を開きます。Cronを手動実行する場合は、開発サーバーの起動中に次を実行します。

```sh
curl http://localhost:8787/__scheduled
```

検査コマンド:

```sh
bun run check
bun run types
bun run dry-run
```

## デプロイ

```sh
bun run deploy
```

Worker名は `bwfnotify-pwa` です。コピー元のWorkerやKVとは独立してデプロイされます。Cronは1分ごとに実行されます。

## モバイルで使う

1. デプロイ先をモバイルブラウザで開きます。
2. PWAをホーム画面へ追加します。
3. ホーム画面からPWAを開き、通知スイッチを有効にします。

iPhone/iPadのWeb Pushは、iOS/iPadOS 16.4以降のホーム画面Webアプリで利用できます。通知許可は、画面上のスイッチ操作を起点として要求されます。詳細は[WebKitの案内](https://webkit.org/blog/13966/web-push-for-web-apps-on-ios-and-ipados/)を参照してください。

## API

| Method | Path | 用途 |
|---|---|---|
| `GET` | `/api/config` | 公開VAPID鍵を取得 |
| `GET` | `/api/status` | 最終確認時刻、ライブ中・ライブ予定の試合を取得 |
| `GET` | `/api/media` | BWF公式画像を許可リスト経由で配信 |
| `POST` | `/api/subscriptions` | Push購読を保存 |
| `DELETE` | `/api/subscriptions` | Push購読を削除 |

## 注意事項

BWFの試合取得先は、安定提供が保証された公開APIであることを確認できていません。URLまたはレスポンス形式の変更により取得できなくなる可能性があります。

実機への通知到達には、端末側の通知許可、ブラウザのPush Service、OS設定が関係します。デプロイ後は対象端末で購読と通知到達を確認してください。

## License

[MIT](LICENSE)
