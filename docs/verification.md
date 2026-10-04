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
