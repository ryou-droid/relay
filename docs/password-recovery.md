# パスワード再設定

## Supabaseで必要な設定

1. **Authentication → URL Configuration** のSite URLを、実際に使用するRelayのURL（Vercelなら `https://あなたのRelayドメイン`）に設定します。
2. Redirect URLsに、そのURLの `/auth/recovery` と `/reset-password` を追加します。既存の `/auth/confirm` は残してください。
3. **Authentication → Email Templates → Reset Password** を開き、`supabase/templates/reset-password.html` の内容を貼り付けて保存します。Confirm signupテンプレートは変更しません。

重要なリンク部分は次のとおりです。

```html
<a
  href="{{ .SiteURL }}/auth/recovery?token_hash={{ .TokenHash }}&amp;type=recovery"
  >パスワードを再設定する</a
>
```

Supabaseの標準 `ConfirmationURL` のままでは今回のサーバー側token_hash検証ルートに戻らないため、このReset Passwordテンプレートの設定が必要です。Site URLを固定の信頼できる戻り先として使用し、利用者が送るHost/Originヘッダーからメールのリンクを作成しません。別端末のSafariでメールを開いても、token_hashを検証してセッションを作成できます。

追加のSQL・DB変更・新しい環境変数・secret key・service role keyは不要です。既存のEmail/Password認証、Confirm email、公開用Supabaseキーを維持します。Supabase側のメール送信制限・レート制限も維持します。標準メール送信の宛先制限がある場合は、登録時と同じく自分の許可されたテストメールで確認してください。

## Vercelでの確認

1. 修正後のGitHub mainを使ったDeploymentがReadyになったことを確認します（本作業ではデプロイ操作はしません）。
2. ログイン画面の「パスワードを忘れた方」から登録メールを入力します。
3. 「メールを確認してください」と表示されることを確認し、届いたメールのリンクをSafariで開きます。
4. 8文字以上の新パスワードと確認用パスワードを入力して保存します。不一致では保存されません。
5. ログイン画面に戻り、新しいパスワードでログインできることを確認します。古いパスワードではログインできないことも確認します。
6. 使用済み・期限切れリンクでは、再送を案内する画面になることを確認します。

## セキュリティと表示

- メールの存在確認やprofiles検索はしません。未知のメールも通常と同じ送信案内にし、登録有無を公開しません。
- 保存処理はサーバー側で長さ・一致・Supabaseによる本人確認を実施し、そのユーザーのpasswordだけを更新します。
- `/reset-password` は正式所属を要求しません。参加待ちのユーザーも自身のパスワードを復旧できます。通常ログイン済みのユーザーも自分のパスワードのみ変更できます。
- リンク検証は `verifyOtp({token_hash,type:'recovery'})`。検証後は固定の `/reset-password` へリダイレクトし、トークンを次のURLに引き継ぎません。任意のnext/redirect先は受け付けません。
- 保存後はglobal signOutを実行し、再ログインを案内します。Supabaseの仕様上、発行済みaccess tokenは有効期限までは残り得ます。ログアウトAPIが失敗した場合も保存済みパスワードを再更新せず、運用ログに記録します。
- 一般的なネットワーク・配信・期限切れ・弱いパスワードなどは日本語の定型メッセージで案内します。APIの生エラー、パスワード、メール、トークンは画面やアプリの診断ログに出しません。
- Vercel Logsの `relay.password_recovery.failed` に操作段階とcode/statusのみを記録します。
