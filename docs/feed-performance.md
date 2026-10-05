# 一覧の取得・カテゴリ切替

## Supabaseで必要な操作

既存4つのmigrationを適用済みのDBでは、SQL Editorで `supabase/migrations/202610050003_feed_performance.sql` の全文を一度実行してください。既存migrationを書き換えず、新しいRPCとindexのみ追加します。データ削除・Auth設定変更・キー変更はありません。

未適用の間もアプリは動きます。新しいRPCが存在しないPGRST202の場合だけ、従来のRLS付き取得へ戻します。権限エラーを旧方式で回避しません。取得件数・集計の性能改善はSQL適用後に有効です。初期構築では全5migrationを順に適用します。

## 改善内容

- ホームの6カテゴリは、各30件の先頭ページを1つのhome_feed RPCで取得。選択状態をflushSyncで即反映し、読み込んだページを端末メモリで切り替えます。タブ切替のRSC要求とSupabase取得は、30秒以内の読込済みカテゴリでは0回です。URLはNext対応のnative historyで更新します。
- 30秒を過ぎたカテゴリは、選択を先に表示してから再検証します。履歴で未取得のタブも、選択・骨格を先に表示し、1回のserver actionで30件を取得します。追加読込は「さらに表示」。created_at＋idによるcursorでOFFSETを使いません。
- 端末のデータは当該画面内だけです。localStorage・service workerへ保存しません。画面を離れると破棄し、サーバーrefreshでは新しい画面インスタンスへ更新します。アプリへ復帰した際にも古いスナップショットを再検証します。権限・所属は各server action/RPCで再確認します。
- postsの本文・全操作履歴を一覧へ転送しません。集計は表示する30件のIDだけ。詳細画面も1投稿分だけのpost_summaries_forを使用します。関与した投稿は担当・確認・補足・履歴の本人IDからUNIONで候補を集め、投稿全件で関与判定を繰り返しません。SQLのEXISTS・既読集計はindexで限定検索し、表示投稿ごとの別HTTP要求はありません。
- ホームは一覧RPCと重要連絡の2要求（以前3）、履歴は一覧RPCの1要求（以前2）。認証getUser・profiles・membershipsの検証は維持し、React.cacheで同一リクエストだけ共有します。Supabase clientも同じリクエスト内で共有します。
- ホーム・履歴は認証確認とRLS/RPCで保護された読取を並行して進めます。sessionが成功する前にデータを表示しません。追加ページのserver actionは最初にsessionを確認します。
- 管理トップはadmin_dashboardで承認待ち件数のみ取得し、申請者の名前・メールやauth.usersとのJOINを取得しません。管理の部署・ユーザー・招待・お知らせの並列取得と、各ページのサーバー権限チェックを維持しています。
- 全RPCは本人の有効所属・部署・停止状態をDBで確認します。管理件数は組織管理者の組織全体、部署管理者の自部署だけ。RLSや書込権限を広げません。internal helperのEXECUTEはAPIロールへ付与しません。

## index

新migrationに部署別の作成日時＋ID順、完了履歴、投稿者別順、完了日時のindexを追加。関与判定用にactivity_logs(actor_id,post_id)、supplements(author_id,post_id)、担当者・既読のuser_id＋post_id、招待一覧の組織別indexも追加します。既存indexは削除しません。

## 計測

`RELAY_PERFORMANCE_LOGS=1` を環境変数へ設定すると、サーバーはrelay.performanceに静的なoperation名、elapsed_ms、成否だけ記録します。SQL・パラメータ・結果行・ユーザーID・メール・トークン・キー・error.messageは記録しません。通常は無効。session.auth/profile/membership、home.feed/notices、feed.history、admin.*とページ処理を比較し、重複操作数も確認できます。旧方式のfallbackはfeed.legacy_*で識別できます。

開発ブラウザのconsoleにはタップからnavigation開始、および開始からURL確定/キャンセルの時間だけ記録します。本番のブラウザには計測ログを出しません。URL確定は表示完了とは別です。カテゴリ選択は遷移ではなく端末内の状態更新です。

`node scripts/benchmark-feeds.mjs` は実Supabaseに接続せず、PGliteの1,200投稿fixtureで旧方式と新方式を比較し、代表的な履歴クエリのindex使用を確認します。今回の3回平均は旧履歴102ms/約703KB、新履歴8ms/約12KB、新ホーム35ms/約58KBでした。PGliteの結果であり、Vercel/Supabaseの本番遅延や実機速度を示すものではありません。実RPCの本番時間は安全な計測ログで確認してください。

## iPhone / iPad

1. 新SQLを適用し、GitHub更新版のVercelビルドがReadyになったらPWAを開き直す。
2. 重要連絡などのカテゴリで、選択色と内容がすぐ切り替わるか確認。横スワイプも確認。
3. 履歴の3タブ、30件後の「さらに表示」、同時刻投稿の重複・抜け、初回と再訪を確認。
4. 管理トップの件数と承認一覧の整合、部署管理者の範囲、一般userの/admin拒否を確認。
5. 投稿・状態変更後の一覧更新、PWAから離れて戻った時の再検証、縦スクロールを確認。
