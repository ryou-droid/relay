# Vercel版の新規登録エラーの確認

## 今回分かったこと

`register()` は `db.auth.signUp()` に `options.data.full_name / planned_department / position` を渡しています。登録フォームのname属性も一致しています。profilesのNOT NULL / CHECKと同じ入力範囲をサーバー側で検証しています。

`auth.users`のAFTER INSERTトリガーが `public.profiles` を作成します。トリガーのINSERTが失敗すれば、Auth登録全体が同じトランザクションでロールバックします。正常メタデータではAuth用の制限付きロールでも登録でき、異常メタデータではロールバックすることをPostgreSQL互換テストで確認しました。ユーザーの実プロジェクトのスキーマ・権限・メール配信状態は未取得なので、実際の原因はログで確定させる必要があります。

## 再確認の手順

1. Vercelで修正後のGitHub mainを使ったDeploymentがReadyになっていることを確認します。本作業ではVercelのデプロイ操作は行いません。
2. Supabase SQL Editorで `supabase/diagnostics/registration.sql` を実行します。読み取り専用です。トリガー、関数所有者、SECURITY DEFINER、profiles列と制約、INSERT権限を確認できます。
3. DB内の詳細診断が必要なら、`supabase/migrations/202610040002_registration_diagnostics.sql` をSQL Editorで実行します。既存の001を再実行しないでください。002は登録関数に診断ログを追加するだけで、既存データ・制約・RLS・トリガー定義・所有者を変更しません。繰り返し適用も可能です。
4. Relayで登録を1回試し、時刻と画面の「確認番号」を控えます。
5. VercelのLogsで `relay.registration.failed` または確認番号を検索します。
6. `Database error saving new user` なら、同じ時刻のSupabase **Logs → Auth / Postgres** を確認します。DBトリガーの失敗は `Relay register_profile failed` で検索できます。

## Vercelに記録される項目

- `message`：Supabase SDKが返す実際のエラーメッセージ（含まれる入力値・資格情報は伏せます）
- `code` / `status` / `errorName`：SDKの値。存在しない場合はnull。現在のSDKはHTTP 500をAuthRetryableFetchErrorへ変換するため、応答にcodeがあってもSDKが保持せずnullになる場合があります。messageとstatusでDBエラーを判定し、詳細はPostgresログで確認します。
- `reference`：ユーザー画面とログを照合する番号
- `stage`：`environment` / `client_initialization` / `auth.signUp`
- `supabase.host`：実際に参照するプロジェクトのホスト。URL全体やキーは出力しません
- `urlConfigured` / `keyConfigured` / `urlValid` / `keyKind`：設定状況。キーの値は出力しません
- `metadataLengths`：3項目の文字数だけ。氏名・メール・部署・役職の実際の値やパスワード、トークン、Cookie、Authレスポンス全体は出力しません

2つの環境変数は `lib/supabase.ts` のサーバークライアントがそのまま参照しています。VercelではProduction/Previewのどちらの環境へ設定したかと、変更後のDeploymentであるかも確認してください。ログのhostがSupabase DashboardのProject URLと一致するかで、別プロジェクトを参照していないか確認できます。

## エラーの読み方

| ログ                                   | 確認箇所                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| `Database error saving new user` / 500 | Auth / Postgresログとトリガー。これだけでは制約や権限のどちらかは断定できません |
| SQLSTATE `23502`                       | profilesの必須列へのNULL、必須メタデータの欠落                                  |
| SQLSTATE `23514`                       | profilesのCHECK制約、実DBの入力制限                                             |
| SQLSTATE `23505`                       | 重複するprofile、他の登録トリガーとの二重INSERT                                 |
| SQLSTATE `42501`                       | 関数所有者の権限、SECURITY DEFINER、FORCE RLS                                   |
| SQLSTATE `42P01` / `42703`             | テーブル / 列の不足、想定スキーマと実DBの差                                     |
| `email_address_not_authorized`         | Supabase標準メール送信の宛先制限。signupのON/OFFとは別です                      |
| `over_email_send_rate_limit` / 429     | メール送信のレート制限                                                          |
| キー / URLに関するエラー               | Vercelの設定スコープ、再ビルド状況、ログの参照先host                            |

診断SQLや002は原因を確認するためのものです。特定のDB不整合を修正するSQLは、ログに基づいて必要な箇所だけに適用します。エラーを無視してAuth登録を成功させたり、ダミーの氏名で制約を回避したり、一般ユーザーへINSERT権限を付与したりしません。

Vercel LogsもAuthの一般的なDBエラーしか返さない場合があるため、DB内部の原因特定にはPostgresログが必要です。ログを共有する場合はmessage・code・status・SQLSTATE・制約名で十分で、キーやパスワードは不要です。
