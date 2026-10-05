import { startTiming } from "@/lib/server/performance";
import Link from "@/components/navigation-link";
import { adminSession, adminRead } from "@/lib/admin";

export default async function Admin() {
  const finish = startTiming("page.admin");
  const context = await adminSession();
  const { membership } = context;
  const data = await adminRead<{ pending_count: number }>(context, "admin_dashboard");
  finish();
  return <><h1>部署・承認管理</h1><div className="admin-menu-grid">
    <Link className="admin-card" href="/admin/approvals"><strong>承認待ち</strong><span>{data?.[0]?.pending_count || 0} 人の参加申請</span></Link>
    <Link className="admin-card" href="/admin/users"><strong>ユーザー</strong><span>招待・利用状態{membership!.role === "organization_admin" ? "・権限" : ""}</span></Link>
    {membership!.role === "organization_admin" && <Link className="admin-card" href="/admin/departments"><strong>部署</strong><span>部署の追加・名前変更</span></Link>}
    <Link className="admin-card" href="/admin/notices"><strong>お知らせ</strong><span>{membership!.role === "organization_admin" ? "組織・部署" : "自部署"}の重要連絡</span></Link>
  </div></>;
}
