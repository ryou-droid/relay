import { redirect } from "next/navigation";
import { configured, supabase } from "./supabase";
export async function session(requireMembership = true) {
  if (!configured()) redirect("/setup");
  const db = await supabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile, error: profileError } = await db.from("profiles")
    .select("suspended").eq("id", user.id).single();
  if (profileError) throw new Error("利用状態を取得できません。DB設定を確認してください。");
  const { data: membership, error } = await db
    .from("memberships")
    .select("id,organization_id,department_id,role,departments(name,active)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (error)
    throw new Error("所属情報を取得できません。DB設定を確認してください。");
  if (requireMembership && profile.suspended) redirect("/suspended");
  const relation = membership?.departments;
  const department = Array.isArray(relation) ? relation[0] : relation;
  const usableMembership = !profile.suspended && department?.active ? membership : null;
  if (requireMembership && !usableMembership) redirect("/waiting");
  return { db, user, membership: usableMembership, suspended: Boolean(profile.suspended) };
}
