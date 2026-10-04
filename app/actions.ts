"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabase, configured } from "@/lib/supabase";
import { session } from "@/lib/session";
const field = (f: FormData, k: string) => String(f.get(k) || "").trim();
const fail = (path: string, message: string): never =>
  redirect(`${path}?error=${encodeURIComponent(message)}`);
export async function login(f: FormData) {
  if (!configured()) redirect("/setup");
  const db = await supabase();
  const { error } = await db.auth.signInWithPassword({
    email: field(f, "email"),
    password: String(f.get("password") || ""),
  });
  if (error)
    fail("/login", "メールアドレスまたはパスワードを確認してください。");
  redirect("/");
}
export async function register(f: FormData) {
  if (!configured()) redirect("/setup");
  const name = field(f, "full_name"),
    department = field(f, "planned_department"),
    position = field(f, "position"),
    password = String(f.get("password") || "");
  if (
    !name ||
    name.length > 80 ||
    !department ||
    department.length > 100 ||
    !position ||
    position.length > 100 ||
    password.length < 8
  )
    fail("/register", "入力内容を確認してください。");
  const db = await supabase();
  const { data, error } = await db.auth.signUp({
    email: field(f, "email"),
    password,
    options: {
      data: { full_name: name, planned_department: department, position },
    },
  });
  if (error)
    fail(
      "/register",
      "登録できませんでした。入力内容と認証設定を確認してください。",
    );
  if (data.session) redirect("/waiting");
  redirect(
    "/login?message=" +
      encodeURIComponent(
        "確認メールを送信しました。メール内のリンクから認証してください。",
      ),
  );
}
export async function logout() {
  const { db } = await session(false);
  await db.auth.signOut();
  redirect("/login");
}
export async function savePost(f: FormData) {
  const { db } = await session();
  const id = field(f, "id") || null;
  const path = id ? `/posts/${id}/edit` : "/posts/new";
  const title = field(f, "title"),
    body = field(f, "body");
  const due = field(f, "due_at");
  if (
    !title ||
    Array.from(title).length > 30 ||
    !body ||
    Array.from(body).length > 300 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(due)
  )
    fail(path, "タイトル・内容・期限を確認してください。");
  const due_at = new Date(due + "+09:00");
  if (!Number.isFinite(due_at.getTime()))
    fail(path, "期限を確認してください。");
  const { data, error } = await db.rpc("save_post", {
    p_id: id,
    p_title: title,
    p_body: body,
    p_kind: field(f, "kind"),
    p_priority: field(f, "priority"),
    p_due_at: due_at.toISOString(),
    p_assignees: f.getAll("assignees").map(String),
  });
  if (error) fail(path, error.message);
  revalidatePath("/", "layout");
  redirect(`/posts/${data}`);
}
export async function postAction(f: FormData) {
  const { db } = await session();
  const id = field(f, "id");
  const action = field(f, "action");
  const { error } = await db.rpc("post_action", { p_id: id, p_action: action });
  if (error) fail(`/posts/${id}`, error.message);
  revalidatePath("/", "layout");
  redirect(action === "delete" ? "/history" : `/posts/${id}`);
}
export async function addSupplement(f: FormData) {
  const { db } = await session();
  const id = field(f, "id"),
    body = field(f, "body");
  if (!body || Array.from(body).length > 100)
    fail(`/posts/${id}`, "補足は1〜100文字で入力してください。");
  const { error } = await db.rpc("add_supplement", { p_id: id, p_body: body });
  if (error) fail(`/posts/${id}`, error.message);
  revalidatePath(`/posts/${id}`);
  redirect(`/posts/${id}`);
}
export async function deleteSupplement(f: FormData) {
  const { db } = await session();
  const id = field(f, "id");
  const { error } = await db.rpc("delete_supplement", {
    s_id: field(f, "supplement_id"),
  });
  if (error) fail(`/posts/${id}`, error.message);
  revalidatePath(`/posts/${id}`);
  redirect(`/posts/${id}`);
}
