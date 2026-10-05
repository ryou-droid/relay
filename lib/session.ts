import { cache } from "react";
import { redirect } from "next/navigation";
import { configured, supabase } from "./supabase";
// React cache is scoped to one server render request, never shared between users.
const loadSession = cache(async () => {
  if (!configured()) redirect("/setup");
  const db = await supabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");
  const [profileResult, membershipResult] = await Promise.all([
    db.from("profiles").select("full_name,position,planned_department,suspended")
      .eq("id", user.id).single(),
    db.from("memberships")
      .select("id,organization_id,department_id,role,departments(name,active)")
      .eq("user_id", user.id).eq("status", "active").maybeSingle(),
  ]);
  const { data: profile, error: profileError } = profileResult;
  const { data: membership, error } = membershipResult;
  if (profileError || !profile) throw new Error("利用状態を取得できません。DB設定を確認してください。");
  if (error)
    throw new Error("所属情報を取得できません。DB設定を確認してください。");
  const relation = membership?.departments;
  const department = Array.isArray(relation) ? relation[0] : relation;
  const usableMembership = !profile.suspended && department?.active ? membership : null;
  return { db, user, profile, membership: usableMembership, suspended: Boolean(profile.suspended) };
});

export async function session(requireMembership = true) {
  const context = await loadSession();
  if (requireMembership && context.suspended) redirect("/suspended");
  if (requireMembership && !context.membership) redirect("/waiting");
  return context;
}
