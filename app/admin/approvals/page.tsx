import Link from "@/components/navigation-link";
import { adminSession, adminRead, type Approval } from "@/lib/admin";
import { AdminMessage } from "@/components/admin-message";

export default async function Approvals({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const context = await adminSession();
  const requests = await adminRead<Approval>(context, "admin_approvals");
  return <><h1>承認待ち</h1><p>ユーザー → 部署 → 承認する、の3タップ。</p><AdminMessage {...await searchParams} />
    <div className="approval-list">{requests.map((request) => <Link className="admin-card" key={request.request_id} href={`/admin/approvals/${request.request_id}`}>
      <strong>{request.full_name}</strong><span>{request.email}</span><span>希望部署：{request.planned_department}</span>
      {!request.email_confirmed && <span className="muted">メール確認待ち</span>}
    </Link>)}</div>{!requests.length && <div className="empty"><h2>承認待ちはありません</h2><p>招待コードで届いた参加申請が表示されます。</p><Link href="/admin/users">招待コードを作る</Link></div>}
  </>;
}
