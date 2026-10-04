import Link from "next/link";
import { session } from "@/lib/session";
import { logout } from "@/app/actions";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";

export default async function Waiting() {
  const { membership } = await session(false);
  if (membership) redirect("/");
  return (
    <main className="auth">
      <span className="brand">Relay</span>
      <div className="waiting-icon">◷</div>
      <h1>組織への参加待ち</h1>
      <p>
        登録が完了しました。管理者による所属承認後、部署の引き継ぎや対応状況を確認できます。
      </p>
      <Link className="button" href="/">
        所属状況を再確認
      </Link>
      <form action={logout}>
        <button className="secondary">ログアウト</button>
      </form>
    </main>
  );
}
