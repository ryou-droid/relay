import Link from "@/components/navigation-link";
import { redirect } from "next/navigation";
import { configured, supabase } from "@/lib/supabase";
import { updatePassword } from "@/app/password-actions";
import PasswordSubmit from "@/components/password-submit";
export const dynamic = "force-dynamic";
export default async function ResetPassword({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!configured()) redirect("/setup");
  const db = await supabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return (
      <main className="auth">
        <Link href="/login" className="brand">
          Relay
        </Link>
        <h1>再設定リンクを確認してください</h1>
        <p>
          リンクが無効または期限切れです。再設定メールをもう一度送信してください。
        </p>
        <Link className="button" href="/forgot-password">
          メールを再送する
        </Link>
      </main>
    );
  const { error } = await searchParams;
  return (
    <main className="auth">
      <Link href="/login" className="brand">
        Relay
      </Link>
      <h1>新しいパスワード</h1>
      <p>8文字以上の新しいパスワードを入力してください。</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <form action={updatePassword}>
        <label>
          新しいパスワード
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        <label>
          確認用パスワード
          <input
            name="confirmation"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        <PasswordSubmit>パスワードを保存</PasswordSubmit>
      </form>
      <p className="center">
        <Link href="/forgot-password">再設定メールを再送する</Link>
      </p>
    </main>
  );
}
