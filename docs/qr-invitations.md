# QR招待

## Supabase

既存migrationを順番に適用した後、SQL Editorで `supabase/migrations/202610050005_qr_invitations.sql` を一度実行してください。既存の招待・参加申請は一般ユーザー扱いのままです。Auth設定・メールテンプレート・新しいキーは不要です。

`organization_invitations` と `join_requests` に `invite_type`（user/admin）を追加します。種別は登録トリガーが招待レコードからコピーし、URL・フォーム・Auth metadataの種別やroleは使用しません。承認RPCは保存済み種別と実際の招待を照合し、管理者候補はorganization_adminだけが承認できます。

新しい読取RPC `admin_approval_candidates` は種別付き承認一覧、`qr_invitations` は組織管理者の2種類の招待、`invitation_kind` は有効な招待の種別だけを返します。公開lookupは組織名・メール・ユーザー情報を返しません。RLSは管理者候補の情報を部署管理者へ広げず、テーブル書き込み権限も追加しません。

## 操作

1. 組織管理者で「管理」→「招待」（`/admin/invite`）を開きます。
2. 「一般ユーザーを招待」または「管理者を招待」の「QRコードを表示」を押します。
3. 相手のiPhone標準カメラでQRを読み、表示された登録リンクを開きます。QR表示画面はiPadでも利用できます。
4. 登録・メール確認後、参加待ちになります。管理者候補の画面には「管理者候補の登録」と表示されます。
5. 組織管理者が承認待ちで「ユーザー」→「部署」→「承認する」。一般用はuser、管理者用はorganization_adminとして所属します。管理者候補は一覧・詳細で明示します。

招待画面とQR作成は組織管理者専用です。部署別QR・部署管理者用QRは作りません。QRは同じ組織の有効な同種招待を再利用し、30日間有効です。期限切れ後は同じ画面で新しいQRを表示します。登録リンクのコピーもできます。招待の無効化は既存のユーザー画面から行えます。

QR生成はサーバーで行い、外部QR APIには送信しません。ホーム起動時のDB取得・JavaScriptバンドルにQR処理を追加しません。招待HTML・登録ページ・QRをService Workerに保存しません。

## 確認

- 一般用URLの `type=user` を `type=admin` にしても一般登録のままで、承認後もuserです。
- 管理者用URLのtypeを変更しても管理者候補のままです。どちらも承認前はmembershipを作りません。
- 一般user・department_adminは `/admin/invite` や作成RPCを利用できません。department_adminは管理者候補を承認できません。
- 別組織・無効・期限切れ招待・メール未確認者・停止者も確認してください。

テストでは実際のSVGを画像化し、別ライブラリでURLを復号しています。実migrationをPGliteに適用し、種別改ざん・承認前の所属なし・承認後role・RLS・他組織隔離も検証します。iPhoneの実カメラ・メール配送・実Supabaseでの登録は、上記手順で実機確認してください。
