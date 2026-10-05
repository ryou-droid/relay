import Link from "@/components/navigation-link";
import { requestPasswordReset } from "@/app/password-actions";
import PasswordSubmit from "@/components/password-submit";
export default async function ForgotPassword({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await searchParams;
  return (
    <main className="auth">
      <Link href="/login" className="brand">
        Relay
      </Link>
      <h1>パスワードの再設定</h1>
      {sent === "1" ? (
        <>
          <p className="notice" role="status">
            メールを確認してください。
          </p>
          <p>
            登録済みのメールアドレスの場合、再設定用のリンクを送信します。迷惑メールフォルダもご確認ください。
          </p>
        </>
      ) : (
        <>
          <p>登録メールアドレスに、再設定用のリンクを送信します。</p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <form action={requestPasswordReset}>
            <label>
              メールアドレス
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
              />
            </label>
            <PasswordSubmit>再設定メールを送信</PasswordSubmit>
          </form>
        </>
      )}
      <p className="center">
        <Link href="/login">ログインへ戻る</Link>
      </p>
      {sent === "1" && (
        <p className="center">
          <Link href="/forgot-password">別のメールアドレスで試す</Link>
        </p>
      )}
    </main>
  );
}
