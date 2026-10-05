import { Suspense } from "react";
import Loading from "@/components/member-loading";
import Link from "@/components/navigation-link";
import { session } from "@/lib/session";
import Nav from "@/components/nav";
import { isAdminRole } from "@/lib/admin-access.mjs";
export const dynamic = "force-dynamic";

async function ProtectedMemberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { membership } = await session();
  const relation = membership!.departments;
  const department = Array.isArray(relation)
    ? relation[0]?.name
    : (relation as { name: string } | null)?.name;
  return (
    <div className="shell">
      <header className="header">
        <Link className="brand" href="/app">
          Relay
        </Link>
        <div className="header-right">
          <span className="department">{department}</span>
          {isAdminRole(membership!.role) && <Link className="admin-entry" href="/admin">管理</Link>}
          <details className="notifications">
            <summary aria-label="通知">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
              </svg>
            </summary>
            <div>通知機能は準備中です。重要連絡はホームで確認できます。</div>
          </details>
        </div>
      </header>
      <main className="content">{children}</main>
      <Nav />
    </div>
  );
}

export default function MemberLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<Loading />}><ProtectedMemberLayout>{children}</ProtectedMemberLayout></Suspense>;
}
