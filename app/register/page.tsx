import AuthForm from "@/components/auth-form";
import { configured, supabase } from "@/lib/supabase";
export default async function Register({ searchParams }: {
  searchParams: Promise<{ error?: string; invite?: string; type?: string }>;
}) {
  const { error, invite } = await searchParams;
  if (!invite) return <AuthForm signup error={error} />;
  // URL type is cosmetic and deliberately ignored. The database is authoritative.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invite))
    return <AuthForm signup error="招待リンクを確認してください。" />;
  if (!configured()) return <AuthForm signup invite={invite} error={error} />;
  const db = await supabase();
  const result = await db.rpc("invitation_kind", { p_invitation: invite });
  if (result.error || !["user", "admin"].includes(result.data))
    return <AuthForm signup invite={invite} error="招待リンクが無効または期限切れです。管理者に確認してください。" />;
  return <AuthForm signup invite={invite} inviteType={result.data} error={error} />;
}
