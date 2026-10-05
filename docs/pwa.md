# Relayをホーム画面から使う

RelayはNext.jsの `app/manifest.ts` によるWeb App Manifest、Apple用metaタグ、192/512pxのPNG・maskableアイコン・180px Appleアイコン・faviconに対応しています。名前はRelay、起動URLは `/`、表示はstandalone、テーマは青 `#2563eb`、背景はUIと同じ `#f5f7fb` です。アイコンの原稿は `public/icons/relay.svg` です。

## iPhone / iPad

1. Safariで `https://relay-rouge-alpha.vercel.app` を開きます。
2. 共有ボタン →「ホーム画面に追加」を選びます。OSによっては「その他」から探します。
3. 「Webアプリとして開く」が表示される場合はONにし、名前Relayで追加します。
4. ホーム画面のRelayアイコンから起動します。SafariのURLバーが表示されず、アプリ内のログイン画面またはホームが開きます。

通常のSafariタブではURLバーが出ます。旧アイコンの名前・画像が変わらない場合は、ホーム画面の旧ショートカットだけを取り除いて追加し直してください。ブラウザとホーム画面アプリはCookieが分かれる場合があるため、再ログインが必要なことがあります。

パスワード再設定のPKCEは**送信を依頼した同じブラウザ環境**でリンクを開く必要があります。iOSでメールがSafariに開く場合は、再設定の送信もSafariから行ってください。PWAから送信して別のSafariでリンクを開くと、検証Cookieがないため再送画面になります。

## Android / PC

AndroidのChromeではメニューの「アプリをインストール」または「ホーム画面に追加」、PCのChrome/Edgeではアドレスバーのインストールボタンまたはメニューを使用します。対応したmacOS Safariでは「ファイル → Dockに追加」も利用できます。インストール操作の名称・対応はOSとブラウザによって異なります。

## オフラインと安全性

- `public/sw.js` をproductionビルドだけで登録します。HTTPSまたはlocalhostのsecure contextが必要です。`next dev`では登録しません。
- キャッシュ対象は専用の公開オフライン画面、Relayアイコン、同一オリジンの `/_next/static/` 配下のJS/CSS/フォントのみ。静的キャッシュは最大64件に制限し、バージョン更新時に古いRelayキャッシュだけ削除します。
- 認証済みHTML・投稿・API・RSC・Server Actions・外部Supabase通信をCache Storageへ保存しません。ページは常にネットワークを利用し、通信失敗時だけ投稿を含まない外枠の案内画面を表示します。オフラインでのログイン・投稿・編集は対応しません。
- `/auth/` のリンク検証は常にサーバーへ送ります。コードやトークンをキャッシュしたり、オフラインページに転送したりしません。既存の認証・RLS・Origin検証は維持しています。
- Service worker自体はno-storeで配信。新workerは旧アプリのウィンドウが閉じるまで待ち、操作途中の強制更新を避けます。
- プッシュ通知・通知権限の要求・App Storeへの配布は実装していません。Supabase側の追加設定・追加キーも不要です。

## 確認

1. 修正を含むVercel DeploymentがReadyになってからホーム画面に追加します。
2. アイコンから起動し、URLバーなしで表示されることを確認します。
3. 通信がある状態でログイン・投稿・パスワード再設定を確認します。
4. 一度オンラインで開いてworkerの登録が終わった後、機内モードで再起動します。Relayのオフライン案内が出ること、投稿が表示されないことを確認します。初回起動からオフラインの場合は準備されていません。
5. PCのDevTools → ApplicationでManifest、Service Workers、Cache Storageを確認します。`relay-static-v1` 内に投稿URL・認証URL・API応答がないことを確認します。Consoleの `matchMedia('(display-mode: standalone)').matches` がtrueならstandalone起動です。iOSでは `navigator.standalone` も確認できます。

ローカルでworkerを確認するには `npm run build` → `npm start` で `http://localhost:3000` を開きます。ポートやオリジンを変える場合は認証の既存Redirect URL設定も適用されます。通常の開発へ戻る前にDevToolsでworkerをUnregisterし、Relayキャッシュを削除すると開発用ファイルと混在しません。

本作業では実機でのインストール・Vercelデプロイ・実Supabaseへの認証試行は行っていません。
