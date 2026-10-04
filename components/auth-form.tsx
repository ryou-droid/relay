import Link from "next/link";
import { login, register } from "@/app/actions";
export default function AuthForm({
  signup,
  error,
  message,
}: {
  signup?: boolean;
  error?: string;
  message?: string;
}) {
  return (
    <main className="auth">
      <Link href="/" className="brand">
        Relay<span className="brand-dot">●</span>
      </Link>
      <p className="eyebrow">チームの引き継ぎを、確かな対応へ。</p>
      <h1>{signup ? "アカウント登録" : "おかえりなさい"}</h1>
      <p>
        {signup
          ? "登録後は、組織への所属承認をお待ちください。"
          : "メールアドレスとパスワードでログイン"}
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      <form action={signup ? register : login}>
        {signup && (
          <label>
            氏名
            <input
              name="full_name"
              autoComplete="name"
              required
              maxLength={80}
            />
          </label>
        )}
        <label>
          メールアドレス
          <input type="email" name="email" autoComplete="email" required />
        </label>
        <label>
          パスワード
          <input
            type="password"
            name="password"
            autoComplete={signup ? "new-password" : "current-password"}
            minLength={8}
            required
          />
        </label>
        {signup && (
          <>
            <label>
              所属予定部署
              <input name="planned_department" required maxLength={100} />
            </label>
            <label>
              役職
              <input name="position" required maxLength={100} />
            </label>
          </>
        )}
        <button>{signup ? "登録する" : "ログイン"}</button>
      </form>
      {!signup && (
        <p className="center">
          <Link href="/forgot-password">パスワードを忘れた方</Link>
        </p>
      )}
      <p className="center">
        <Link href={signup ? "/login" : "/register"}>
          {signup ? "ログインへ" : "初めての方はこちら"}
        </Link>
      </p>
    </main>
  );
}
