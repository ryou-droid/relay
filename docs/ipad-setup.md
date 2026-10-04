# 次にあなたがやること（iPad向け）

## 1. 開発用Supabaseを用意する

Safariで https://supabase.com/dashboard を開きます。Relay専用の空の開発用プロジェクトがなければ、Freeプランで新規作成してください。既存の空の開発用プロジェクトでも構いません。本番データのあるプロジェクトは使わないでください。

プロジェクト作成時に入力するDBパスワードは、Gitへ保存したり、このチャットへ送ったりする必要はありません。

## 2. DBを作る

GitHubの `supabase/migrations/202610040001_relay.sql` を開き、Raw表示の全文をコピーします。Supabaseの **SQL Editor → New query** に貼り付け、**Run** を押します。初回に1度だけ実行します。続いて `supabase/migrations/202610040002_registration_diagnostics.sql` も実行します（登録時のDBエラー診断ログ用）。

- このSQLが10テーブル、RLS、登録トリガー、操作用RPCを作ります。
- `supabase/config.toml` はCLI用なので、管理画面へ貼り付けません。
- `supabase/setup/test-membership.sql` は後の手順7で使用します。

## 3. Relayを動かす場所を用意する

iPadだけなら、GitHubの **Code → Codespaces → Create codespace on main** を使うと、Safari内で開発できます。無料枠が利用できる場合のみ使用し、課金を求められる場合は契約せず止めてください。Codespacesのターミナルで次を実行します。

```sh
npm ci
cp .env.example .env.local
```

ローカルPCがある場合も、リポジトリをcloneして同じコマンドを実行できます。

## 4. 接続情報を設定する

Supabaseのプロジェクトの **Connect** または **Settings → API / API Keys** で、Project URLとpublishable keyを確認します。Codespacesのエディタで `.env.local` を開き、2行を実際の値へ変更して保存します。

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

使うのはpublishable keyです。secret keyやservice_roleキーは入れません。`.env.local` はGitの対象外です。

```sh
npm run dev
```

Codespacesの **Ports → 3000 → Open in Browser** から開きます。ポートの **VisibilityはPrivateのまま** にしてください。この開発プレビューは本番デプロイではありません。実際のURLは `https://…-3000.app.github.dev` の形式です。

PCで動かす場合は `http://localhost:3000` を開きます。iPadのlocalhostはPCやCodespacesを指しません。

## 5. Supabase Authを設定する

Supabaseの **Authentication → Sign In / Providers → Email**（管理画面の版によって表示名が異なります）で次を確認します。

- Email / Passwordによる登録・ログインを有効にする
- 新規ユーザー登録を許可する
- Confirm email（メール確認）を有効にする
- 最低パスワード長を8文字以上にする

**Authentication → URL Configuration** で、Site URLを手順4で開いたRelayのURLへ設定します。CodespacesならプレビューURL、PCなら `http://localhost:3000` です。Redirect URLsにも同じURLの `/auth/confirm` を追加します。

**Authentication → Email Templates → Confirm signup** のリンクを次へ変更して保存します。

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email"
  >メールアドレスを確認する</a
>
```

Supabase標準のテスト用メール送信は、プロジェクトのチームメンバーのメール宛に制限される場合があります。まず自分のSupabaseアカウントのメールアドレスで登録してください。配信できない場合はAuthのログと送信制限を確認します。一般利用者への配信や複数メールのテストには、別途SMTPの設定が必要になることがあります。今回は有料SMTPを契約する必要はありません。

## 6. ユーザーを登録する

Relayの登録画面で、氏名・メール・パスワード・所属予定部署・役職を入力します。届いたメールの確認リンクをiPadのSafariで開き、必要ならログインします。

この時点では **「組織への参加待ち」** が正しい動作です。正式所属前はホームや履歴を表示できません。

SupabaseのUsers画面から直接ユーザーを作ると、氏名などの必須メタデータが足りず登録トリガーが失敗するため、Relayの画面から登録してください。

## 7. テスト用組織・部署へ所属させる

GitHubの `supabase/setup/test-membership.sql` をコピーし、SQL Editorへ貼り付けます。`your-test-email@example.com` を手順6で登録したメールへ変更し、**Run** を押します。

SQLは「Relayテスト組織」「テスト部署」を作り、登録済みのユーザーを一般ユーザーとして所属させます。パスワードやAPIキーの入力は不要です。登録済みメールを配列に追加すると、同部署の2人目も所属させられます。

Relayへ戻り、**所属状況を再確認** を押すとホームが開きます。

## 8. 動作を確認する

1. 「投稿」から期限・担当者を設定して投稿する。
2. 詳細を開き、既読人数・内容・担当者を確認する。
3. 「対応します」を押すと「対応中」になり、本人でも編集できなくなる。
4. 補足を追加・削除し、操作履歴に残ることを確認する。
5. 「完了にする」を押し、ホームの新着から外れて履歴に表示されることを確認する。
6. 未所属の別ユーザーでは参加待ちのままであることを確認する。

別部署・別組織の隔離も確認する場合は、READMEの所属SQLを使い、追加ユーザーを別部署/別組織に所属させます。自分の投稿のURLをそのユーザーで開いても表示できないことを確認してください。

終了後はCodespacesを停止して無料枠の消費を止めます。プレビューURLが変わったらSupabaseのSite URLとRedirect URLsも更新します。Vercelの本番デプロイはこの手順には含みません。

## Codespacesでフォーム送信が失敗した場合

`Invalid Server Actions request` は、ブラウザのOriginとCodespacesプロキシから届くHostの不一致で発生します。Relayは `next dev` の場合だけ、Codespaces標準の環境変数から**現在のCodespaceのポート3000**を許可します。本番build/startでは追加許可しません。`*.app.github.dev` のような広い許可や、Origin検証の無効化は不要です。

1. ターミナルで `Ctrl+C` を押して開発サーバーを停止します。
2. `git pull --ff-only origin main` で修正を取得します。
3. `npm ci` の後、`npm run dev` で起動します。設定の反映には再起動が必要です。
4. Portsの3000をPrivateのまま開き直し、古いタブを閉じてログイン・新規登録を再送信します。

この設定は `CODESPACES=true`、`CODESPACE_NAME`、`GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN`（省略時app.github.dev）を使用します。キーの変更は不要です。別ポートや別CodespaceのURLでは送信できません。`proxy.ts`でOrigin/Hostを書き換えず、Next.js自身のCSRF検証を維持します。
