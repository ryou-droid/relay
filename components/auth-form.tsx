import Link from "@/components/navigation-link";
import { login, register } from "@/app/actions";
export default function AuthForm({
  signup,
  error,
  message,
  invite,
  inviteType,
}: {
  signup?: boolean;
  error?: string;
  message?: string;
  invite?: string;
  inviteType?: "user" | "admin";
}) {
  return (
    <main className="auth">
      <Link href="/" className="brand">
        Relay
      </Link>
      <h1>{signup ? (inviteType === "admin" ? "管理者候補の登録" : "アカウント登録") : "ログイン"}</h1>
      {signup && <p>登録後は所属承認が必要です。</p>}
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
            {invite ? <input type="hidden" name="invitation_code" value={invite} /> : <label>
              招待コード（組織の管理者から受け取った場合）
              <input name="invitation_code" maxLength={36} autoComplete="off" autoCapitalize="none" spellCheck={false} />
            </label>}
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
