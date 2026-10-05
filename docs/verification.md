# 第1段階の検証記録

2026-10-04、Node.js 24 / Next.js 16.3.8。

- `npm run build`：成功。認証が必要なページは動的レンダリング。
- `npm run typecheck`：成功。
- `npm run lint`：成功。
- `npm test`：成功。実マイグレーションをPGliteに適用して検証。
- Chromium / Playwright：320、375、390、430、768、1024、1440pxでログイン・登録・画面検証用fixtureを表示。横はみ出しなし。モバイルのカテゴリ横スクロール、固定ナビ、日付選択を確認。
- 画面fixtureは本物のPostCard・PostForm・Navと共通CSSを使用し、検証後に削除。認証済みユーザーの実Supabaseデータを使ったE2Eではありません。

DBテストでは未所属・別部署・別組織の隔離、組織/部署重要連絡のスコープ、権限自己変更の拒否、不正担当者の拒否、入力長と期限必須、既読者名の非公開、本人以外の編集拒否、対応開始後の編集不可、状態変更、補足の本人削除、投稿の論理削除と監査記録を確認しました。

本環境では通常サンドボックスのネットワーク/ポート制約があるため、依存取得・build・ブラウザ検証はネットワーク許可を追加したコマンドで実施しました。検査をスキップするNext.js設定は使用していません。

未検証：実Supabaseのメール配送・トークン更新・REST API統合、実機iOS Safari/Android Chrome。READMEの受け入れ確認手順に従って接続後に確認してください。

GitHubのoriginは `https://github.com/ryou-droid/relay.git`。初期確認でremote refは0件でした。追加指示の外部公開禁止に従い、push・デプロイ・本番DBへの適用は実施していません。

## Codespaces Server Actions修正の検証

- `next dev`だけで、現在のCodespaceのポート3000をallowedDevOrigins / Server Actions allowedOriginsへ設定。production build/startでは追加Originがないことを、Next.jsの実際の設定ローダーで確認。
- Next.js 16.3.8の隔離した開発サーバーに、実際のログイン・登録フォームのAction IDでHTTP POST。OriginをCodespaces URL、x-forwarded-hostをlocalhost:3000として不一致を再現。許可したURLはActionへ到達し303応答。別Codespaceと外部サイトは500のInvalid Server Actions requestで拒否。
- HTTPテストではSupabase接続を設定せず、Action内の設定確認による/setupリダイレクトを到達証拠として使用。実際のアカウント登録・ログイン成功は、ユーザーの接続済みCodespacesで確認する。
- `npm run build` / `npm run typecheck` / `npm run lint` / `npm test`：すべて成功。キー・Auth設定・本番環境は変更していない。

## Vercel登録エラーの診断追加

- `register()`に、SDKのmessage・code・status・エラー種別、照合番号、参照先ホスト、メタデータ文字数を選択して記録する構造化ログを追加。フォーム・Authレスポンス・キー・Cookieはログに渡さず、エラーメッセージ中の入力値・トークンも伏せる。
- 実際の登録フォーム→Server Action→Supabase SDKを隔離したNext.js開発サーバーと模擬Auth APIで実行。メタデータ3項目の送信、HTTP 500/429のログ、画面の確認番号、正常応答によるログイン画面への遷移を確認。実Supabaseへの登録試行ではない。
- Auth用の制限付きDBロールで実SQLの登録トリガーを実行。正常入力でprofilesを作成し、必須メタデータ欠落・空文字・長さ超過でAuthユーザーもロールバックすることを確認。診断マイグレーションの再適用と読み取り専用診断SQLも検証。
- build・TypeScript・lint・テストが成功。本番データ、Supabase設定・キー、Vercelデプロイは変更していない。
- 実際の障害原因はVercel/Supabaseログ未取得のため未確定。診断ログを利用して次の登録試行で特定する。

## パスワード再設定

- ログインからのメール送信画面、token_hashのRecovery検証、新パスワードと確認欄、保存後のログイン画面への遷移を実装。
- 模擬Auth APIを使い、実際のSupabase SSR SDKのresetPasswordForEmail → verifyOtp → Cookie保存 → getUser → updateUser → global signOutを検証。使用済みリンクの拒否、未知メールの汎用案内、ログの機密情報除外も検証。
- 長さ・不一致の検査はサーバーで行い、正規のAuthセッションの本人だけを更新。所属や組織データにはアクセスしない。
- npm run build / typecheck / lint / testが成功。Next.jsのCLI型検査出力がサンドボックスで解析できないため、TypeScript 5.9の公式compiler API方式へ切り替えた。型検査は無効化していない。Origin許可範囲も維持。
- 実Supabaseのメール配送と実Vercelでの再設定は未実施。キー変更・DB変更・デプロイ操作は実施していない。

## 標準メールテンプレート対応

- redirectToを明示し、標準ConfirmationURLのcodeをexchangeCodeForSessionで処理するPKCE方式に対応。recovery由来のセッション確認後、固定の/reset-passwordへ遷移。旧token_hash方式も互換対応。
- 実Supabase SSR SDK＋模擬Auth APIでcode/token_hashの両経路、redirectToとPKCE challengeの送信、Cookie永続化、本人確認、更新、ログアウト、検証Cookieのないブラウザの拒否を確認。
- 本番URL固定、PreviewはVercel環境変数、開発はlocalhostまたは現在のCodespaceのみ。任意Hostから戻り先を作らない。許可されていないPreview hostnameを拒否するテストを追加。
- Supabase Authの公開ソースではSite URLと同じscheme/host/portを許可。現在の本番Site URLが正しければテンプレート・Redirect URLsの追加変更は原則不要。別オリジンは許可が必要。実プロジェクト設定と実メール配送は未確認。

## PWA対応

- Next.js 16のManifest規約、standalone、Apple用meta・180pxアイコン、192/512pxとmaskableアイコン、faviconを追加。独自PWA依存パッケージは追加していない。
- service workerをVMで実行し、公開静的ファイルのキャッシュ、ページのネットワーク優先と汎用オフライン画面、認証URL・Server Actions・API・RSC・外部Supabase通信のキャッシュ回避を確認。PNG寸法とICO構造を検証。
- build・TypeScript・lint・全テストが成功。実機インストールと実Vercel上の認証は未確認。この作業環境ではローカルサーバーのlistenがEPERMで拒否されるため、ブラウザによるインストール試験は実施できていない。
- Supabase設定・キー・DBは変更していない。デプロイ操作・プッシュ通知の実装も行っていない。利用と再確認はdocs/pwa.mdを参照。

## 管理者と一般ユーザーの分離

- 通常URLを/appへ移動し、旧URLには互換リダイレクトを設定。/admin以下に承認・ユーザー・部署・重要連絡の管理を追加。管理者だけ通常画面に入口を表示。
- テストでは実際の各管理ページとレイアウトのTSXをコンパイルして実行し、一般ユーザーとしての表示要求が管理データ取得前に/appへリダイレクトすることを検証。Auth/sessionとNext.jsのredirectはテスト用に差し替えており、実HTTP/実Supabaseでの試行ではない。
- 実際のServer Actionsもコンパイルして一般ユーザーによる呼び出し拒否を検証。通常画面のヘッダーを実行し、一般ユーザーには管理入口が出ず、両管理者roleには表示されることを確認。
- 全マイグレーションを適用したPGliteで、組織別/部署別の申請とユーザーの隔離、招待による組織紐づけ、確認済みメールだけの承認、3権限の差、部署重複、停止/再開、お知らせ範囲、内部関数のEXECUTE拒否、監査ログを検証。従来の投稿ライフサイクル・登録トリガーテストも新マイグレーション適用後に検証。
- 新しい管理用SQLと最初の管理者設定SQLを追加。実Supabaseへの適用・キー変更・本番デプロイは行っていない。ユーザー側の設定/確認手順はdocs/admin.mdを参照。
- build・TypeScript・lint・全テストが成功。管理用SQLを含む従来機能のテストも成功。実機のタップ・HTTPによるE2E表示は未検証で、docs/admin.mdの受け入れ確認で行う。
