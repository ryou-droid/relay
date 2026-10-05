# Relay

企業・小規模事業所向けの「引き継ぎ・確認・対応管理」Webアプリ。チャットではなく、期限のある投稿を部署内で確認・対応するアプリです。一般ユーザー機能に加え、組織・部署管理者の承認と管理に対応しています。

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
2. SQL Editorで `supabase/migrations/202610040001_relay.sql`、続いて `supabase/migrations/202610040002_registration_diagnostics.sql`、`supabase/migrations/202610050001_admin.sql`、`supabase/migrations/202610050002_admin_read_only.sql`、`supabase/migrations/202610050003_feed_performance.sql` を順に実行します。またはSupabase CLIを導入済みなら `supabase db push` で適用します。001は初回適用専用です。既存のRelay DBには未適用のマイグレーションだけ追加適用してください。管理機能には今回の `202610050001_admin.sql` が必要です。
3. AuthenticationでEmail / Passwordを有効化し、メール確認を有効にしてください。最低パスワード長は8文字以上を推奨します。
4. Site URLを開発時は `http://localhost:3000` に設定します。実運用URL・許可するRedirect URLは運用時に人間が設定してください。
5. Authentication → Email Templates → Confirm signupの確認リンクを以下に設定してください。

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email"
  >メールアドレスを確認する</a
>
```

6. アプリから氏名・メール・パスワード・所属予定部署・役職を入力して登録します。登録トリガーがprofilesと、招待コードがある場合だけ組織別の参加申請を作成します。ユーザー入力のroleや部署名から正式所属は作成しません。
7. 最初の組織・所属・組織管理者だけは信頼できる運用者がSQL Editorで設定します。所属後の管理者設定は `supabase/setup/first-admin.sql` を使用できます。その後は `/admin` から部署登録、招待、3タップ承認を行います。[管理者の設定とiPhone確認手順](docs/admin.md) を参照してください。

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

重要連絡は管理者が `/admin/notices` から登録できます。department_idがNULLなら組織重要連絡、UUIDを指定すると部署重要連絡になります。activeな連絡は組織・部署それぞれ最大1件、本文500文字までです。一般ユーザーに投稿・管理権限はありません。

## 実装済み

- メール/パスワード登録・ログイン・メール確認・ログアウト、参加待ち画面
- パスワード再設定メール、Recoveryリンク検証、新パスワード保存
- マルチテナントと3権限のDB構造、所属承認前・停止時の閲覧遮断
- `/app` と `/admin` の分離、組織別招待、3タップ承認、部署管理、ユーザー停止/再開・権限/部署変更、重要連絡管理
- 部署内投稿（連絡 / 注意 / 引き継ぎ / 対応依頼）、重要度3段階、必須期限日時
- 今日・明日・日付指定と時刻指定、日本時間で入力・表示、DBはtimestamptz
- 同部署の担当者を0〜複数人指定、タイトル30文字・内容300文字・補足100文字
- ホームの重要連絡、横スクロールカテゴリ、カード、固定下部ナビ
- 詳細を表示した際の既読記録、人数のみ集計、確認・対応開始・完了、全員による状態変更
- 投稿者本人による編集（対応開始後は永久に編集不可）、投稿・自分の補足の論理削除
- 操作履歴、完了・自分の投稿・関わった投稿の履歴、マイページ
- iPhoneのsafe-area、16pxの入力文字、大きなタップ領域、PC/iPad/Android向けレイアウト
- PWAのManifest・Relayアイコン・standalone起動・公開静的ファイルのみの最小オフライン表示

「新着」は未完了投稿を作成日時の新しい順に表示します。「重要連絡」カテゴリは重要度「高」の未完了投稿を表示します（組織・部署の重要連絡は上部の固定領域に表示）。「未確認」は詳細をまだ開いていない投稿です。「関わった投稿」は投稿・担当指定・確認・対応開始・状態変更・補足追加などの操作がある投稿です。

完了した投稿は通常の一覧から外れ、本日完了および履歴に表示されます。削除した投稿は通常画面には表示されず、DBの監査記録を保持します。一般ユーザーに既読者名の一覧は提供しません。操作履歴の「確認しました」「対応を開始」等の明示操作は実行者を表示します。

## セキュリティ設計

- 全テーブルでRLSを有効化。所属・role・停止・部署有効状態をサーバー/DB側で判定します。
- 投稿・担当・補足・操作履歴は同じ組織かつ同じ部署のみ。組織重要連絡だけは同じ組織の正式メンバーに表示。
- 未所属ユーザーは自分のprofile・所属情報・参加申請以外の組織データを取得できません。
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

組織の新規作成・設定UI、管理者用既読者名表示、通知配信・PWAプッシュ、課金、添付、検索、AI機能は未実装です。通知ベルは準備中表示です。PWAのManifest・service workerは導入済みです。APIとDBを独立させており、通知・期限1時間前のジョブはdue_atを使って追加できます。

次は実Supabaseでの管理機能統合テストと監査データの保持方針を整備してください。003適用時はDB側でカテゴリ抽出とカーソルページングを行います。004適用時はホームの初回取得量をさらに減らします。

## Vercel

リポジトリをインポートし、Next.jsプリセットを選び、同じ2つの環境変数を設定すればデプロイできる構成です。VercelへのデプロイやSupabase本番DBへの適用は行っていません。ソースコードはGitHubのmainに保存します。

登録エラーの診断は [Vercel版の新規登録エラーの確認](docs/registration-troubleshooting.md) を参照してください。

パスワード再設定はSupabaseの標準メールテンプレートに対応しています。[再設定の動作・環境別の戻り先・確認手順](docs/password-recovery.md) を参照してください。本番Site URLが現在のRelay URLなら追加設定は原則不要です。

ホーム画面への追加・オフライン動作の確認は [PWAの利用手順](docs/pwa.md) を参照してください。

管理画面の読み込み失敗は [管理RPCの25006修正と安全な診断](docs/admin-troubleshooting.md) を参照してください。管理SQLを適用済みの場合は新しい `202610050002_admin_read_only.sql` だけを追加適用します。

画面遷移の先読み、読み込みUI、リクエスト単位の取得共有については [画面遷移の改善](docs/navigation-performance.md) を参照してください。認証設定の変更は不要です。一覧取得の速度改善には、下記の新しいSQLを追加適用してください。

一覧の30件取得・即時カテゴリ切替を有効にするには、新しい `supabase/migrations/202610050003_feed_performance.sql` をSQL Editorで一度実行してください。未適用の間は既存の取得方式を使用します。[一覧性能と計測の手順](docs/feed-performance.md) を参照してください。

PWA起動用の公開App Shell・分割Streaming・ホーム初回15件取得は [起動と画面表示](docs/startup-performance.md) を参照してください。003適用済みの場合は `supabase/migrations/202610050004_startup_feed.sql` を追加実行します。
