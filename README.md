# BWFNotify PWA

[![CI](https://github.com/nematatu/BWFNotify-PWA/actions/workflows/ci.yml/badge.svg)](https://github.com/nematatu/BWFNotify-PWA/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

BWF大会に出場する日本人選手の試合予定とライブスコアを表示し、試合開始をWeb Pushで通知するCloudflare Workers製PWAです。

本プロジェクトはBadminton World Federation（BWF）の公式製品ではありません。BWFおよび大会・選手に関する名称、画像、商標は各権利者に帰属します。

## 主な機能

- 日本人選手のライブ中・開始予定の試合を表示
- 15秒間隔のライブ得点更新（画面表示中のみ）
- ゲーム得点、サーブ側、対戦成績、前回対戦結果を表示
- 大会画像、選手写真、国旗をBWF画像の許可リスト経由で表示
- 日本人選手名を設定ファイルから日本語表記へ変換
- 試合開始をWeb Pushで通知
- 通知は全対象試合が既定で有効、試合ごとに除外可能
- 公式配信元と試合条件を確認できた場合のみYouTube直接リンクを表示
- iOS/iPadOS、Android、デスクトップ向けPWA

## 構成

```text
Cloudflare Workers Cron（2分間隔）
  -> BWF Match Centreのデータを取得
  -> 日本人選手の試合を抽出
  -> 公式YouTube配信候補をサーバー側で解決
  -> Cloudflare KVへ状態を必要時のみ保存
  -> 購読ごとの除外設定を適用してWeb Pushを送信

ブラウザ（画面表示中）
  -> /api/liveを15秒間隔で取得
  -> ライブ得点とサーブ側を更新
```

静的画面とService WorkerはWorkers Static Assetsから配信します。フロントエンドはSolidJSとViteでビルドします。

```text
src/api/          HTTP API、外部取得アダプター、通知処理
src/config/       日本人選手名、公式配信元の設定
src/frontend/     SolidJS画面、状態管理、Service Worker
src/type/         共有TypeScript型
src/utils/        共有ユーティリティ
public/pwa/       Service Worker、Manifest、PWA画像
test/             単体テスト
integration/      Workers結合テスト
e2e/              Playwright表示テスト
```

## 必要環境

- [Bun](https://bun.sh/) 1.3.14以降
- Cloudflareアカウント
- Web Push対応ブラウザ

## セットアップ

依存関係をインストールします。

```sh
bun install --frozen-lockfile
```

VAPID鍵とローカル用設定を作成します。

```sh
bun run generate:vapid
cp .dev.vars.example .dev.vars
```

生成結果を `.dev.vars` の `VAPID_PUBLIC_KEY` と `VAPID_PRIVATE_KEY` に設定します。`VAPID_SUBJECT` には管理者へ連絡可能な `mailto:` URLまたはHTTPS URLを設定してください。`.dev.vars` はGit管理対象外です。

### KV Namespace

`wrangler.jsonc` に記載されたKV Namespace IDは、この公開インスタンス専用です。フォーク先のCloudflareアカウントでは新しいNamespaceを作成し、`id` と `preview_id` を置き換えてください。

```sh
bunx wrangler kv namespace create NOTIFIED_MATCHES
bunx wrangler kv namespace create NOTIFIED_MATCHES --preview
```

本番用Secretを登録します。

```sh
bunx wrangler secret put VAPID_PUBLIC_KEY
bunx wrangler secret put VAPID_PRIVATE_KEY
bunx wrangler secret put VAPID_SUBJECT
```

## 開発

```sh
bun run dev
```

画面は `http://localhost:5173`、Worker APIは `http://127.0.0.1:8787` で起動します。どちらか一方が終了すると、もう一方も停止します。Workerの起動後、試合データを取得するscheduled処理を1回だけ自動実行します。

追加でscheduled処理を確認する場合は、開発サーバーの起動中に次を実行します。

```sh
curl http://localhost:8787/__scheduled
```

コミット前の検査:

```sh
bun run precommit
```

個別の検査:

```sh
bun run typecheck
bun run types:check
bun run lint
bun run test:unit
bun run test:integration
bun run test:layout
bun run dry-run
```

PlaywrightのChromiumが未導入の場合は、先に次を実行してください。

```sh
bunx playwright install chromium
```

## デプロイ

`main` へのpushをCloudflare側のパイプラインが検知してデプロイします。このリポジトリの通常運用では手動デプロイしません。ローカルでは `bun run dry-run` でWorkerのビルドだけを検証します。

フォークして別環境へ配置する場合は、Worker名、KV Namespace、Cron、公開URLを `wrangler.jsonc` で変更してください。現在のCronは2分間隔です。

## モバイル通知

1. デプロイ先をSafariまたはChromeで開きます。
2. PWAをホーム画面へ追加します。
3. ホーム画面からPWAを起動し、通知スイッチを有効にします。

iPhone/iPadのWeb Pushは、iOS/iPadOS 16.4以降のホーム画面Webアプリで利用できます。通知許可は画面上の操作を起点に要求します。詳細は[WebKitの案内](https://webkit.org/blog/13966/web-push-for-web-apps-on-ios-and-ipados/)を参照してください。

## API

| Method | Path | 用途 |
|---|---|---|
| `GET` | `/api/config` | 公開VAPID鍵を取得 |
| `GET` | `/api/status` | Cronが保存した試合状態を取得 |
| `GET` | `/api/live` | 最新のライブ試合と得点を取得 |
| `GET` | `/api/media` | 許可したBWF公式画像を中継 |
| `POST` | `/api/subscriptions` | Push購読を保存 |
| `PATCH` | `/api/subscriptions` | 試合ごとの通知除外設定を更新 |
| `POST` | `/api/subscriptions/test` | 保存済み購読へテスト通知を送信 |
| `DELETE` | `/api/subscriptions` | Push購読を削除 |

APIは公開契約としての安定性を保証していません。互換性に影響する変更はリリースノートまたはPull Requestで明示してください。

## 設定データ

- 日本人選手名: [`src/config/japanese-player-names.ts`](src/config/japanese-player-names.ts)
- 大会別の公式配信元: [`src/config/youtube-stream-sources.ts`](src/config/youtube-stream-sources.ts)

選手名や配信元を追加する場合は、確認可能な根拠をPull Requestへ記載してください。YouTubeは設定済み公式チャンネルの動画だけを照合し、条件を満たす直接URLが確認できない場合はリンクを表示しません。

## データと制約

Cloudflare KVには、Push購読情報、試合ごとの通知除外、通知済み状態、対戦成績キャッシュを保存します。Push Serviceが購読終了を返した場合、または利用者が通知を解除した場合は購読情報を削除します。独自インスタンスの運用者は、適用される法令とプライバシー要件を確認してください。

BWFの取得先は、安定提供が保証された公開APIであることを確認できていません。URL、アクセス制限、レスポンス形式の変更により機能しなくなる可能性があります。過剰なアクセスを避けるため、取得間隔とキャッシュを維持してください。

YouTube配信は地域制限、未配信、配信元の変更、タイトル形式の違いにより解決できない場合があります。検索結果への代替リンクは生成しません。

## コントリビューション

開発手順とPull Request要件は[CONTRIBUTING.md](CONTRIBUTING.md)を参照してください。脆弱性は公開Issueへ投稿せず、[SECURITY.md](SECURITY.md)の手順で報告してください。

## License

[MIT License](LICENSE)

画面表示には[LINE Seed JP](https://seed.line.me/)を使用しています。LINE Seed JPはSIL Open Font License 1.1で提供されています。
