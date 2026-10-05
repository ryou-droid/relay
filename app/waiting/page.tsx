import Link from "@/components/navigation-link";
import { session } from "@/lib/session";
import { logout, requestMembership } from "@/app/actions";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";

export default async function Waiting({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const { membership, suspended, db, user } = await session(false);
  if (suspended) redirect("/suspended");
  if (membership) redirect("/app");
  const query = await searchParams;
  const { data: requests, error } = await db.from("join_requests").select("id").eq("user_id", user.id).eq("status", "pending");
  if (error) throw new Error("参加申請を取得できません。管理用SQLの適用を確認してください。");
  return (
    <main className="auth">
      <span className="brand">Relay</span>
      <div className="waiting-icon">◷</div>
      <h1>組織への参加待ち</h1>
      <p>
        登録が完了しました。管理者による所属承認後、部署の引き継ぎや対応状況を確認できます。
      </p>
      {query.error && <p className="error" role="alert">{query.error}</p>}
      {query.message && <p className="notice" role="status">{query.message}</p>}
      {!requests?.length && <form action={requestMembership}>
        <p>組織の管理者から招待コードを受け取り、参加申請を送ってください。</p>
        <label>招待コード<input name="invitation_code" required maxLength={36} autoComplete="off" autoCapitalize="none" spellCheck={false} /></label>
        <button>参加申請を送る</button>
      </form>}
      <Link className="button" href="/app">
        所属状況を再確認
      </Link>
      <form action={logout}>
        <button className="secondary">ログアウト</button>
      </form>
    </main>
  );
}
