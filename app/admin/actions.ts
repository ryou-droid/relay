"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { adminSession } from "@/lib/admin";

const value = (form: FormData, key: string) => String(form.get(key) || "").trim();
const uuid = (input: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input);
const fail = (path: string, message = "操作できませんでした。権限や入力内容を確認してください。"): never =>
  redirect(`${path}?error=${encodeURIComponent(message)}`);
function changed() {
  revalidatePath("/admin", "layout");
  revalidatePath("/app", "layout");
}
function report(error: { code?: string }, operation: string) {
  console.error("relay.admin.failed", { operation, code: error.code });
}

export async function approveUser(form: FormData) {
  const { db } = await adminSession();
  const request = value(form, "request_id"), department = value(form, "department_id");
  if (!uuid(request) || !uuid(department)) fail("/admin/approvals", "部署を選択してください。");
  const { error } = await db.rpc("approve_user", { p_request: request, p_department: department });
  if (error) { report(error, "approve"); fail(`/admin/approvals/${request}`, "承認できませんでした。メール確認・所属状況・選択部署を確認してください。"); }
  changed();
  redirect("/admin/approvals?message=" + encodeURIComponent("承認しました。"));
}

export async function saveDepartment(form: FormData) {
  const { db } = await adminSession(true);
  const id = value(form, "id"), name = value(form, "name");
  if ((id && !uuid(id)) || !name || Array.from(name).length > 100) fail("/admin/departments", "部署名は1〜100文字で入力してください。");
  const { error } = await db.rpc("save_department", { p_id: id || null, p_name: name, p_active: form.get("active") === "on" });
  if (error) {
    report(error, "department");
    fail("/admin/departments", error.code === "23505" ? "同じ名前の部署がすでにあります。" : "変更できませんでした。所属ユーザーのいる部署は無効化できません。");
  }
  changed(); redirect("/admin/departments?message=" + encodeURIComponent("部署を保存しました。"));
}

export async function manageUser(form: FormData) {
  const { db } = await adminSession();
  const id = value(form, "membership_id"), department = value(form, "department_id"), role = value(form, "role");
  if (!uuid(id) || !uuid(department) || !["user", "department_admin", "organization_admin"].includes(role)) fail("/admin/users");
  const { error } = await db.rpc("manage_user", { p_membership: id, p_department: department, p_role: role, p_suspended: form.get("suspended") === "on" });
  if (error) { report(error, "user"); fail("/admin/users", "変更できませんでした。自分自身・管理範囲外のユーザーは変更できません。"); }
  changed(); redirect("/admin/users?message=" + encodeURIComponent("ユーザーを更新しました。"));
}

export async function createInvitation(form: FormData) {
  const { db } = await adminSession();
  const department = value(form, "department_id");
  if (department && !uuid(department)) fail("/admin/users");
  const { data, error } = await db.rpc("create_invitation", { p_department: department || null });
  if (error) { report(error, "invitation"); fail("/admin/users"); }
  changed(); redirect("/admin/users?invite=" + encodeURIComponent(String(data)));
}
export async function revokeInvitation(form: FormData) {
  const { db } = await adminSession();
  const id = value(form, "id");
  if (!uuid(id)) fail("/admin/users");
  const { error } = await db.rpc("revoke_invitation", { p_id: id });
  if (error) { report(error, "revoke_invitation"); fail("/admin/users"); }
  changed(); redirect("/admin/users");
}
export async function saveNotice(form: FormData) {
  const { db } = await adminSession();
  const department = value(form, "department_id"), body = value(form, "body");
  if ((department && !uuid(department)) || !body || Array.from(body).length > 500) fail("/admin/notices", "お知らせは1〜500文字で入力してください。");
  const { error } = await db.rpc("save_notice", { p_department: department || null, p_body: body });
  if (error) { report(error, "notice"); fail("/admin/notices"); }
  changed(); redirect("/admin/notices?message=" + encodeURIComponent("お知らせを掲載しました。"));
}
export async function disableNotice(form: FormData) {
  const { db } = await adminSession();
  const id = value(form, "id");
  if (!uuid(id)) fail("/admin/notices");
  const { error } = await db.rpc("disable_notice", { p_id: id });
  if (error) { report(error, "disable_notice"); fail("/admin/notices"); }
  changed(); redirect("/admin/notices");
}

export async function createQrInvitation(form: FormData) {
  const { db } = await adminSession(true);
  const kind = value(form, "invite_type");
  if (kind !== "user" && kind !== "admin") fail("/admin/invite");
  const { data, error } = await db.rpc("create_qr_invitation", { p_type: kind });
  if (error) { report(error, "qr_invitation"); fail("/admin/invite", "招待を表示できません。管理者にSQLの適用状況を確認してください。"); }
  revalidatePath("/admin/invite");
  redirect("/admin/invite?invite=" + encodeURIComponent(String(data)));
}
