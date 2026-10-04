# Relay

企業・小規模事業所向けの「引き継ぎ・確認・対応管理」Webアプリ。チャットではなく、期限のある投稿を部署内で確認・対応するための第1段階です。

## 技術構成

Next.js 16 / React 19 / TypeScript / Supabase Auth・PostgreSQL・RLS。追加のUIライブラリを使わずCSSでレスポンシブ対応。Node.js 22以上を推奨（Next.jsの最低要件は20.9）。VercelのNext.jsプリセットでビルドできます。

iPadからの設定は [次にあなたがやること](docs/ipad-setup.md) にまとめています。テスト所属用SQLは `supabase/setup/test-membership.sql` です。

## セットアップ

```sh
npm ci
cp .env.example .env.local
npm run dev
```

`.env.local`にSupabaseプロジェクトのURLと**公開用publishable key**を設定します。

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

`service_role`キーやsecret keyをブラウザ用の環境変数に入れないでください。環境変数未設定の場合は接続設定画面だけが表示されます。実データに見せかけたサンプルデータは表示しません。

### Supabaseの設定

1. 新しい開発用Supabaseプロジェクトを用意します。既存DBへは適用前にスキーマを確認してください。
2. SQL Editorで `supabase/migrations/202610040001_relay.sql` を実行します。またはSupabase CLIを導入済みなら `supabase db push` で適用します。初回適用専用のマイグレーションです。
3. AuthenticationでEmail / Passwordを有効化し、メール確認を有効にしてください。最低パスワード長は8文字以上を推奨します。
4. Site URLを開発時は `http://localhost:3000` に設定します。実運用URL・許可するRedirect URLは運用時に人間が設定してください。
5. Authentication → Email Templates → Confirm signupの確認リンクを以下に設定してください。

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email"
  >メールアドレスを確認する</a
>
```

6. アプリから氏名・メール・パスワード・所属予定部署・役職を入力して登録します。登録トリガーがprofilesだけを作成します。ユーザー入力のroleや部署名から正式所属は作成しません。
7. 第1段階には承認UIがないため、開発用の組織・部署・所属は信頼できる運用者がSQL Editorで明示的に登録してください。

```sql
-- 例：テスト組織を作成し、返されたUUIDを次のSQLへ使用します。
insert into public.organizations(name) values ('テスト組織') returning id;
insert into public.departments(organization_id, name)
values ('<organization UUID>', 'テスト部署') returning id;

-- AuthenticationのUsersで登録済みのuser UUIDを確認してください。
insert into public.memberships(user_id, organization_id, department_id, role, status)
values ('<user UUID>', '<organization UUID>', '<department UUID>', 'user', 'active');
```

所属は現在1ユーザー1つのactive部署です。追加部署への移動時は古い所属をrevokedにしてから新しい所属を有効化します。登録時の「所属予定部署」は申告情報であり、承認権限やアクセス権を持ちません。

重要連絡は運用者が `important_notices` に登録できます。department_idがNULLなら組織重要連絡、UUIDを指定すると部署重要連絡になります。activeな連絡は組織・部署それぞれ最大1件、本文500文字までです。一般ユーザーに投稿・管理権限はありません。

## 実装済み

- メール/パスワード登録・ログイン・メール確認・ログアウト、参加待ち画面
- マルチテナントと3権限のDB構造、所属承認前の閲覧遮断
- 部署内投稿（連絡 / 注意 / 引き継ぎ / 対応依頼）、重要度3段階、必須期限日時
- 今日・明日・日付指定と時刻指定、日本時間で入力・表示、DBはtimestamptz
- 同部署の担当者を0〜複数人指定、タイトル30文字・内容300文字・補足100文字
- ホームの重要連絡、横スクロールカテゴリ、カード、固定下部ナビ
- 詳細を表示した際の既読記録、人数のみ集計、確認・対応開始・完了、全員による状態変更
- 投稿者本人による編集（対応開始後は永久に編集不可）、投稿・自分の補足の論理削除
- 操作履歴、完了・自分の投稿・関わった投稿の履歴、マイページ
- iPhoneのsafe-area、16pxの入力文字、大きなタップ領域、PC/iPad/Android向けレイアウト

「新着」は未完了投稿を作成日時の新しい順に表示します。「重要連絡」カテゴリは重要度「高」の未完了投稿を表示します（組織・部署の重要連絡は上部の固定領域に表示）。「未確認」は詳細をまだ開いていない投稿です。「関わった投稿」は投稿・担当指定・確認・対応開始・状態変更・補足追加などの操作がある投稿です。

完了した投稿は通常の一覧から外れ、本日完了および履歴に表示されます。削除した投稿は通常画面には表示されず、DBの監査記録を保持します。一般ユーザーに既読者名の一覧は提供しません。操作履歴の「確認しました」「対応を開始」等の明示操作は実行者を表示します。

## セキュリティ設計

- 全10テーブルでRLSを有効化。所属はuser_idとstatus='active'からサーバー/DB側で判定します。
- 投稿・担当・補足・操作履歴は同じ組織かつ同じ部署のみ。組織重要連絡だけは同じ組織の正式メンバーに表示。
- 未所属ユーザーは自分のprofile・所属情報以外の組織データを取得できません。
- クライアントにテーブルINSERT/UPDATE/DELETE権限は付与せず、権限チェック付きRPCだけで更新します。所属・roleの自己変更は不可。
- SECURITY DEFINER関数は空のsearch_pathと明示的なスキーマ参照、EXECUTE権限のallowlistを使用します。
- 投稿の編集と対応開始は同じ投稿の行ロックで直列化。対応開始と同時に編集して制限を回避することを防ぎます。
- post_readsには一般ユーザー向けSELECTポリシーを作らず、RPCが既読人数と本人の確認状況だけを返します。
- 削除は論理削除し、削除対象・実行者・時刻を監査記録に保存。Authユーザーの物理削除も参照制約で簡単に履歴を消せません。

## 検証

```sh
npm run build
npm run typecheck
npm run lint
npm test
```

`npm test`はPGlite（PostgreSQL互換の開発用エンジン）に実際のマイグレーションを適用し、別組織・別部署・未所属の隔離、権限自己変更禁止、担当者制限、既読者名の遮断、編集制限、状態変更、論理削除と監査記録を検証します。PGliteはdevDependencyのみです。

本物のSupabaseプロジェクトは未接続です。メール配送、Authプロキシのトークン更新、実プロジェクトのRLS/REST動作は、環境変数とSQLを設定後に次の受け入れ確認を行ってください。

1. 未所属アカウントでログインし、ホーム・詳細・履歴URLを直接入力しても参加待ちになる。
2. 同部署2人、別部署1人、別組織1人で登録・所属設定し、他部署の投稿UUIDをURLに入力しても表示されない。
3. 自分の投稿を編集でき、他人が「対応します」を押した後は編集できない。
4. 詳細の再表示で既読人数が増え続けず、既読者名が取得できない。
5. 全員による状態変更、補足削除、完了後の履歴移動、ログアウトを確認する。
6. 実機Safari / Android Chromeで入力・横スワイプ・safe-area・キーボード表示を確認する。

## 今回未実装・次の段階

管理者ダッシュボード、所属承認UI、部署/組織管理、重要連絡管理、管理者用既読者名表示、通知配信・PWAプッシュ、課金、添付、検索、AI機能は未実装です。通知ベルは準備中表示です。PWAのmanifest・service workerはまだ導入していません。APIとDBを独立させており、通知・期限1時間前のジョブはdue_atを使って追加できます。

次は管理者向け承認・所属管理と管理用RLS/RPCを追加し、実Supabaseでの統合テスト、アーカイブ一覧のページング、監査データの保持方針を整備してください。現時点では小規模部署向けに投稿をまとめて取得します。大規模運用前にDB側のカテゴリ抽出・ページングを追加してください。

## Vercel

リポジトリをインポートし、Next.jsプリセットを選び、同じ2つの環境変数を設定すればデプロイできる構成です。VercelへのデプロイやSupabase本番DBへの適用は行っていません。第1段階のソースコードはGitHubのmainに保存します。
