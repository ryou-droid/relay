import "server-only";
import { redirect } from "next/navigation";
import { session } from "./session";
import { requireAdminSession } from "./admin-access.mjs";
import { randomUUID } from "node:crypto";
import { adminFailure } from "./server/admin-log.mjs";

export async function adminSession(organizationOnly = false): Promise<Awaited<ReturnType<typeof session>>> {
  return requireAdminSession(session, redirect, organizationOnly);
}

export async function adminRead<T>(context: Awaited<ReturnType<typeof adminSession>>, rpc: "admin_approvals" | "admin_users" | "admin_notices"): Promise<T[]> {
  let failure: unknown;
  try {
    const { data, error } = await context.db.rpc(rpc);
    if (!error) return (data || []) as T[];
    failure = error;
  } catch (error) {
    failure = error;
  }
  const reference = randomUUID();
  console.error(JSON.stringify(adminFailure({
    reference, operation: rpc, error: failure,
    redactions: [context.user.email || "", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || ""],
  })));
  throw new Error(`管理データを取得できません。確認番号：${reference}`);
}

export type Department = { id: string; name: string; active: boolean };
export type Approval = {
  request_id: string; user_id: string; full_name: string; email: string;
  planned_department: string; position: string; department_id: string | null;
  email_confirmed: boolean; created_at: string;
};
export type AdminUser = {
  membership_id: string; user_id: string; full_name: string; email: string;
  position: string; department_id: string; department_name: string;
  role: string; suspended: boolean;
};

export async function adminDepartments(activeOnly = false) {
  const context = await adminSession();
  let query = context.db.from("departments").select("id,name,active")
    .eq("organization_id", context.membership!.organization_id).order("name");
  if (activeOnly) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw new Error("部署を取得できません。管理用SQLの適用を確認してください。");
  return { ...context, departments: (data || []) as Department[] };
}
