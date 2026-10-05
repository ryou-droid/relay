import Link from "next/link";
import { adminSession } from "@/lib/admin";

export default async function Admin() {
  const { db, membership } = await adminSession();
  const { data, error } = await db.rpc("admin_approvals");
  if (error) throw new Error("管理用SQLの適用を確認してください。");
  return <><h1>チームを管理</h1><p>部署を用意し、参加申請を承認しましょう。</p><div className="admin-menu-grid">
    <Link className="admin-card" href="/admin/approvals"><strong>承認待ち</strong><span>{data?.length || 0} 人の参加申請</span></Link>
    <Link className="admin-card" href="/admin/users"><strong>ユーザー</strong><span>招待・利用状態{membership!.role === "organization_admin" ? "・権限" : ""}</span></Link>
    {membership!.role === "organization_admin" && <Link className="admin-card" href="/admin/departments"><strong>部署</strong><span>部署の追加・名前変更</span></Link>}
    <Link className="admin-card" href="/admin/notices"><strong>お知らせ</strong><span>{membership!.role === "organization_admin" ? "組織・部署" : "自部署"}の重要連絡</span></Link>
  </div></>;
}
