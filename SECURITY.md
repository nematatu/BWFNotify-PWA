# セキュリティポリシー

## サポート対象

セキュリティ修正は原則として`main`ブランチへ適用します。過去のコミットや独自フォークへの個別サポートは行いません。

## 公開設定と秘密情報

`wrangler.jsonc`はWorker構成の基準としてGit管理します。Worker名、Cron、Binding名、KV Namespace IDは認証情報ではありません。VAPID秘密鍵やCloudflare APIトークンなど、権限を与える値は記載しません。

本番の秘密情報はCloudflare Secrets、ローカルの秘密情報はGit管理対象外の`.dev.vars`で管理します。`.dev.vars.example`にはプレースホルダーだけを記載します。開発用の`wrangler.dev.jsonc`は本番KVのIDを持たず、ローカルKVだけを使用します。

## 脆弱性の報告

脆弱性やPush購読情報の漏えいにつながる問題は、公開Issueへ投稿しないでください。GitHubの[Security Advisories](https://github.com/nematatu/BWFNotify-PWA/security/advisories)から **Report a vulnerability** を選び、非公開で報告してください。

報告には次の情報を含めてください。

- 影響を受けるコミットまたはデプロイ
- 再現条件と最小限の手順
- 想定される影響
- 修正案がある場合はその概要

実利用者のPushエンドポイント、購読鍵、VAPID秘密鍵、個人情報は報告へ直接貼らず、必要な部分を伏せてください。

受領後は内容を確認し、GitHub Security Advisory内で対応します。影響と修正を確認できるまで、公開や第三者への共有は控えてください。
