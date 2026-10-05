# 管理画面の読み込み失敗（25006）

## 再現した原因

`admin_approvals`・`admin_users`・`admin_notices` はSTABLE関数です。SupabaseのREST APIを提供するPostgRESTは、STABLE/IMMUTABLE RPCをPOSTで呼び出した場合も読み取り専用トランザクションで実行します。

以前のSQLでは、これらの関数が `require_admin()` を呼び、内部で memberships / profiles にSELECT FOR SHAREのロックを取得していました。読み取り専用トランザクションではこのロックが禁止され、以下が発生します。

```text
code: 25006
message: cannot execute SELECT FOR SHARE in a read-only transaction
```

通常のREAD WRITEトランザクションを使った旧テストでは、この問題を再現していませんでした。今回、実マイグレーションを適用したDBでBEGIN READ ONLYを使い、管理者のrole・auth.uid()・有効な所属が正しくても3つの閲覧RPCが失敗することを再現しました。

参考：[PostgRESTのトランザクション仕様](https://github.com/PostgREST/postgrest/blob/main/docs/references/transactions.rst)

## 修正とSupabaseでの操作

1. **SQL Editor → New query** を開き、`supabase/migrations/202610050002_admin_read_only.sql` の全文を貼り付けて実行します。
2. 既存の `202610050001_admin.sql` は書き換えも再実行もしません。今回のSQLは適用済み管理スキーマの差分修正です。データを削除しません。安全に再適用できます。
3. 読み取り専用の `check_admin_read()` を追加し、3つの閲覧RPCだけがこれを使用します。role・active所属・suspended・部署active・組織/部署scopeは同じ条件で確認します。
4. `require_admin()` と承認・停止・部署・お知らせ変更のロックは維持します。RLSとテーブル書き込み権限も変更しません。内部helperにはauthenticated/anonのEXECUTEを付与せず、公開RPCも一般userを内部で拒否します。
5. SQL末尾でPostgRESTのschema cacheを再読み込みします。Auth設定・キー変更・新しい環境変数は不要です。

新規構築の場合は001 → 登録診断002 → 管理001 → 今回の管理read_only002の順に適用してください。

## 安全なログと切り分け

修正後のサーバーコードは、3つの管理閲覧RPCが失敗した場合にVercel Logsへ `relay.admin.failed` を出します。選択したcode/message/details/hintと確認番号・RPC名だけを記録します。メール・キー・Bearer/JWT・URL・UUID・SQLリテラル・行内容・キー値などを伏せ、各診断文の長さも制限します。レスポンス全体、Cookie、headers、session、結果のユーザー行はログへ渡しません。画面は一般的なエラー表示のままです。

- `25006`：今回の修正SQLと3つの関数定義を確認。
- `42501`：関数のEXECUTE権限とownerを確認。内部helperへ一般userのEXECUTEを付与して回避しないでください。
- `PGRST202`：関数の存在とschema cacheを確認。
- `P0001` /「管理権限がありません」：現在のAuthユーザー、active所属、role、suspended、部署activeを確認。

`supabase/diagnostics/admin.sql` は、関数定義・owner・GRANT・RLSの読み取り専用確認用です。ユーザーのメールやトークンは表示しません。**SQL Editorのauth.uid()は通常NULL**なので、そこで管理RPCを直接呼んで権限エラーが出ても、iPhoneでログインしたユーザーの権限とは別です。JWTやサービスキーを貼り付けて検証する必要はありません。

## iPhoneでの再確認

1. 上記の修正SQLを適用します。
2. 修正コードを含むVercel版がReadyになったことを確認します。本作業ではデプロイ操作はしません。
3. organization_adminでログインし、`/app` の「管理」から `/admin` を開きます。
4. 承認待ち・ユーザー・お知らせを開き、一覧が表示されることを確認します。申請がなければ0件で正常です。
5. 一般userで管理URLを直接開き、引き続き `/app` へ戻ることを確認します。
6. まだ失敗する場合はVercel Logsで `relay.admin.failed` を探し、確認番号と伏字済みの4項目で原因を確認します。キーやCookieを共有する必要はありません。

実SupabaseプロジェクトのLogs・実Vercel画面には本作業からアクセスしていません。実環境のエラーが25006かはログで照合してください。読み取り専用DBでの再現・修正後の成功、管理者のページ描画、一般userの拒否は自動テストで確認しています。
