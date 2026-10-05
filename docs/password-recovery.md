# パスワード再設定

## 標準メールテンプレートでの動作

Email Templatesは変更不要です。`resetPasswordForEmail` に `redirectTo` を指定し、標準テンプレートの `ConfirmationURL` から `/auth/recovery?code=...` に戻します。SSRクライアントが生成したPKCE verifierをCookieに保存し、コールバックで `exchangeCodeForSession` を実行します。recoveryセッションを確認後、`/reset-password` へ移動します。

- 本番：`https://relay-rouge-alpha.vercel.app/auth/recovery`
- Vercel Preview：Vercelが提供する `VERCEL_URL` の `/auth/recovery`
- ローカル：`http://localhost:3000/auth/recovery`
- Codespaces：現在のCodespaceのポート3000の `/auth/recovery`

戻り先は信頼できる実行環境の設定から選びます。リクエストのHost/Originや任意のredirectパラメータは使用しません。新しい環境変数・SQL・secret key・service role keyは不要です。

## Supabase管理画面の追加操作は必要か

既にSite URLが `https://relay-rouge-alpha.vercel.app` なら、Supabase Authは同じスキーム・ホスト・ポートへのリダイレクトを許可するため、本番の `/auth/recovery` を使うための追加設定は原則不要です。実際のプロジェクト設定と配信は本作業から直接確認できていません。

Preview・Codespaces・localhostは別オリジンです。既に許可済みなら追加操作不要ですが、未許可なら **Authentication → URL Configuration → Redirect URLs** に、その環境の正確な `/auth/recovery` URLを追加する必要があります。アプリだけでSupabaseの許可設定を回避することはできません。全ドメインを許可するワイルドカードは使用しません。

`supabase/templates/reset-password.html` は以前の任意テンプレート用です。今回貼り付ける必要はありません。既に設定している場合の `token_hash` 方式も互換対応しています。

## 再テスト

1. GitHub mainの修正を含むVercel DeploymentがReadyになったことを確認します。本作業ではデプロイ操作をしません。
2. iPadのSafariで本番Relayを開き、「パスワードを忘れた方」から登録メールを送信します。
3. **送信した同じSafari・同じブラウザプロファイル**で、最新メールのリンクを開きます。別端末・別ブラウザ・プライベートブラウズではPKCE Cookieがなく検証できません。メールアプリの内蔵ブラウザではなくSafariで開いてください。
4. `/reset-password` に到達し、8文字以上の新パスワードと確認欄を入力します。
5. 保存後、ログイン画面へ戻ること、新パスワードでログインできることを確認します。不一致・使用済み・期限切れリンクは保存できません。

修正前のメールではなく、新しく送信したメールを使用してください。Supabaseの配信・レート制限は変更しません。

## セキュリティと表示

- メールの存在確認やprofiles検索はしません。未知のメールも通常と同じ送信案内にし、登録有無を公開しません。
- 保存処理はサーバー側で長さ・一致・Supabaseによる本人確認を実施し、そのユーザーのpasswordだけを更新します。
- `/reset-password` は正式所属を要求しません。参加待ちのユーザーも自身のパスワードを復旧できます。通常ログイン済みのユーザーも自分のパスワードのみ変更できます。
- 標準リンクはPKCEの `exchangeCodeForSession(code)` で検証し、recovery由来のセッションだけ受け付けます。旧テンプレートは `verifyOtp({token_hash,type:'recovery'})` で互換検証します。検証後は固定の `/reset-password` へリダイレクトし、トークンを次のURLに引き継ぎません。任意のnext/redirect先は受け付けません。
- 保存後はglobal signOutを実行し、再ログインを案内します。Supabaseの仕様上、発行済みaccess tokenは有効期限までは残り得ます。ログアウトAPIが失敗した場合も保存済みパスワードを再更新せず、運用ログに記録します。
- 一般的なネットワーク・配信・期限切れ・弱いパスワードなどは日本語の定型メッセージで案内します。APIの生エラー、パスワード、メール、トークンは画面やアプリの診断ログに出しません。
- Vercel Logsの `relay.password_recovery.failed` に操作段階とcode/statusのみを記録します。
