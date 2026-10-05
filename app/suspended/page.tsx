import { redirect } from "next/navigation";
import { session } from "@/lib/session";
import { logout } from "@/app/actions";

export const dynamic = "force-dynamic";
export default async function Suspended() {
  const { suspended } = await session(false);
  if (!suspended) redirect("/app");
  return <main className="auth"><span className="brand">Relay</span><h1>利用が停止されています</h1>
    <p>所属組織の管理者へお問い合わせください。</p>
    <form action={logout}><button>ログアウト</button></form>
  </main>;
}
