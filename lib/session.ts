import { redirect } from "next/navigation";
import { configured, supabase } from "./supabase";
export async function session(requireMembership = true) {
  if (!configured()) redirect("/setup");
  const db = await supabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");
  const { data: membership, error } = await db
    .from("memberships")
    .select("id,organization_id,department_id,role,departments(name)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (error)
    throw new Error("所属情報を取得できません。DB設定を確認してください。");
  if (requireMembership && !membership) redirect("/waiting");
  return { db, user, membership };
}
