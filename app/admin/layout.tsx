import { Suspense } from "react";
import Loading from "@/app/loading";
import Link from "@/components/navigation-link";
import { adminSession } from "@/lib/admin";

export const dynamic = "force-dynamic";
async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const { membership } = await adminSession();
  return <div className="shell admin-shell">
    <header className="header"><Link className="brand" href="/admin">Relay <small>管理</small></Link><Link className="button secondary" href="/app">通常画面へ</Link></header>
    <main className="content"><p className="eyebrow">{membership!.role === "organization_admin" ? "組織管理者" : "部署管理者"}</p>
      <nav className="admin-nav" aria-label="管理メニュー">
        <Link href="/admin/approvals">承認待ち</Link><Link href="/admin/users">ユーザー</Link>
        {membership!.role === "organization_admin" && <Link href="/admin/departments">部署</Link>}
        <Link href="/admin/notices">お知らせ</Link>
      </nav>{children}</main>
  </div>;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<Loading />}><ProtectedAdminLayout>{children}</ProtectedAdminLayout></Suspense>;
}
