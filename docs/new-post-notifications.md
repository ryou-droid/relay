# 新規投稿通知

通知はユーザーがマイページの「通知をONにする」を押した端末だけです。タイトルはRelay、本文は「新しい投稿が追加されました」。氏名・メール・投稿タイトル・本文・組織名は含めません。

## セットアップ（iPadから）

1. SupabaseのSQL Editorで、既存migration適用後に `supabase/migrations/202610060001_new_post_push.sql` を一度実行します。既存テーブルのRLS・既存migrationは変更しません。
2. GitHub CodespacesのTerminalで `npm run push:keys` を**自分で**実行します。表示される3値を保管します。このコマンドの出力はGit・公開ページ・サーバーログへ貼らないでください。本作業では鍵生成を実行していません。
3. Vercel → Project → Settings → Environment Variablesへ以下を設定します。Production/Previewは使う環境ごとに設定します。

| 環境変数 | 設定する値 |
|---|---|
| `NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY` | コマンドのpublic key。公開してよい鍵 |
| `WEB_PUSH_PRIVATE_KEY` | コマンドのprivate key。サーバー専用 |
| `PUSH_DISPATCH_TOKEN` | コマンドのtoken。サーバー専用、32文字以上 |
| `WEB_PUSH_SUBJECT` | 運用者の連絡先。例 `mailto:operator@example.com` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Settings → API Keysの既存service_role key。サーバー専用 |

既存のSupabase URL・publishable keyもそのまま必要です。private key・service_role・tokenに `NEXT_PUBLIC_` を付けません。service_roleは送信処理の専用サーバーモジュールだけが使用し、通常画面・登録・購読保存は本人の認証とRLSを使用します。

4. 環境変数を含むDeploymentがReadyになってから次へ進みます。公開鍵はbuild時に埋め込まれるため、環境変数を設定しただけでは既存Deploymentに反映されません。本作業ではデプロイしていません。
5. `supabase/setup/new-post-push-cron.sql` を開き、`REPLACE_WITH_PUSH_DISPATCH_TOKEN`を同じtokenへ置き換え、URLを実際のVercel URLへ合わせます。Supabase SQL Editorで一度実行します。これは送信キューを**毎分**処理するCronと、サーバー専用tokenをVaultへ登録するための設定です。Supabase Cron/pg_net/Vaultを使用します。tokenを貼ったSQLをGitへ保存しません。

重要：通常のRelayからの投稿はNext.js `after()`で応答後すぐに送信します。Cronはサーバー中断・一時エラー・DBからの投稿を拾うために必要です。失敗は最大5回再試行し、5分を過ぎた通知は送りません。Pushサービス受理と端末への到着は別で、OSの集中モード・省電力・通信状態によって遅延/非表示になる場合があります。

## iPhone / iPadで確認

1. iOS/iPadOS 16.4以降でSafariからRelayをホーム画面へ追加し、アイコンから起動します。
2. 同じRelayのPWAとSafariタブを一度閉じて再度開き、Service Workerを更新します。「閉じて開き直す」と出る場合はもう一度閉じます。
3. マイページ → 新規投稿通知 →「通知をONにする」→ OSの許可画面で許可します。画面が「この端末：ON」になることを確認します。
4. 同じ部署の別ユーザーが新規投稿します。投稿者には届かず、受信者にはRelay／「新しい投稿が追加されました」が届くことを確認します。
5. 通知を押して対象投稿が開くことを確認します。別部署・別組織・停止ユーザー・OFFの端末には届かないことも確認します。
6. 「通知をOFFにする」でDBの購読を無効化してから端末の購読を解除します。許可を拒否してもRelay本体はそのまま使用できます。マイページのログアウトでもこの端末の購読を解除します。

AndroidはChrome、PCは対応するChrome/Edge/Firefox/Safariで設定できます。HTTPSが必要です。開発用`next dev`では通知設定を有効にしません。ローカル確認はproduction buildと `npm start` を使用し、端末・ブラウザがWeb Pushへ対応していることも確認します。

## 通知の流れとセキュリティ

- postsのINSERTトリガーだけで、同じ組織・部署の正式メンバーかつ未停止・部署有効・購読ONの端末をキューへ登録します。投稿者本人・編集は対象外です。
- 保存後の `after()`と、秘密token付きの `/api/push/dispatch` がキューを処理します。DBの行ロック・短いleaseで並列処理の競合を抑えます。
- サーバーは送信直前に、停止・部署変更・投稿削除・OFF・鍵更新を再確認します。無効な端末（HTTP404/410）は購読OFFにします。重複配送は通知tagで同じ通知へまとめます。
- Service Workerは端末の現在のログイン状態を `/api/push/verify` へ問い合わせ、DBがその受信者の現在の所属と購読を再確認してから表示します。ログアウト/別アカウント・停止・部署移動・削除済みなら表示しません。オフラインで確認できない場合も表示しません。Safariでは表示しないpushが続くと購読が失効する場合があります。再びONにして確認してください。
- 送信先はApple/Google/Mozilla/WindowsのPushサービスへ限定し、任意URLへのサーバーアクセスを防ぎます。端末キー・購読URL・providerの生エラーはログに出しません。
- 認証済みデータ・通知payloadをService Workerで長期キャッシュしません。ホーム起動時のDB取得を増やさず、設定確認はマイページだけ、送信処理はサーバー側だけで実行します。

## 費用・追加の土台

専用の有料通知APIや外部サービス契約は不要です。標準Web Push、Vercel、既存SupabaseのCron/Vaultを利用します。既存プランのDB・実行時間・ネットワーク等の無料枠は消費します。大量利用時の課金/プラン変更は本作業では行いません。

push_subscriptionsは端末購読、push_outboxは通知種別・再試行・配信状態を管理します。今回はkindをnew_postだけに限定しています。重要連絡・期限通知は次のmigrationで種別/対象抽出/スケジューラを追加でき、購読・暗号化送信・権限再確認を再利用できます。今回それらの通知は送信しません。

実migration、対象の隔離、停止/部署変更/OFF、lease、再試行、秘密token検証、Service Workerの表示とクリックを自動テストします。実際のVAPID鍵生成・SupabaseへのSQL適用・Cron設定・ブラウザPushサービスへの送信・iPhone実機テストはユーザー側の上記手順で確認します。
