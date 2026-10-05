"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabase, configured } from "@/lib/supabase";
import { session } from "@/lib/session";
import { randomUUID } from "node:crypto";
import { registrationFailure } from "@/lib/server/registration-log.mjs";
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
  redirect("/app");
}
export async function register(f: FormData) {
  // Use the same direct environment references as the Supabase client, including
  // NEXT_PUBLIC values resolved at build time. Values are never written to logs.
  const registrationEnvironment = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    VERCEL_ENV: process.env.VERCEL_ENV,
    NODE_ENV: process.env.NODE_ENV,
  };
  if (!configured()) {
    console.error(
      "[Relay registration]",
      JSON.stringify(
        registrationFailure({
          reference: randomUUID(),
          stage: "environment",
          env: registrationEnvironment,
          error: new Error(
            "Required Supabase environment variables are missing.",
          ),
        }),
      ),
    );
    redirect("/setup");
  }
  const name = field(f, "full_name"),
    department = field(f, "planned_department"),
    position = field(f, "position"),
    password = String(f.get("password") || "");
  const invitation = field(f, "invitation_code");
  if (invitation && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invitation))
    fail("/register", "招待コードを確認してください。");
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
  const reference = randomUUID();
  const email = field(f, "email");
  const metadata = {
    full_name: name,
    planned_department: department,
    position,
    ...(invitation ? { invitation_code: invitation } : {}),
  };
  const logFailure = (error: unknown, stage: string) => {
    console.error(
      "[Relay registration]",
      JSON.stringify(
        registrationFailure({
          reference,
          stage,
          error,
          env: registrationEnvironment,
          redactions: [email, password, name, department, position, invitation],
          metadataLengths: Object.fromEntries(
            Object.entries(metadata).map(([key, value]) => [
              key,
              Array.from(value).length,
            ]),
          ),
        }),
      ),
    );
  };
  const failureMessage = `登録できませんでした。時間をおいて再度お試しください。解決しない場合は管理者へお問い合わせください。（確認番号：${reference}）`;
  let stage = "client_initialization";
  let result;
  try {
    const db = await supabase();
    stage = "auth.signUp";
    result = await db.auth.signUp({
      email,
      password,
      options: { data: metadata },
    });
  } catch (error) {
    logFailure(error, stage);
    return fail("/register", failureMessage);
  }
  const { data, error } = result;
  if (error) {
    logFailure(error, "auth.signUp");
    fail("/register", failureMessage);
  }
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
export async function requestMembership(form: FormData) {
  const { db, suspended } = await session(false);
  if (suspended) redirect("/suspended");
  const invitation = field(form, "invitation_code");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invitation))
    fail("/waiting", "招待コードを確認してください。");
  const { error } = await db.rpc("request_membership", { p_invitation: invitation });
  if (error) fail("/waiting", "参加申請できませんでした。コードの有効期限や申請状況を管理者に確認してください。");
  redirect("/waiting?message=" + encodeURIComponent("参加申請を送信しました。承認をお待ちください。"));
}
export async function savePost(f: FormData) {
  const { db } = await session();
  const id = field(f, "id") || null;
  const path = id ? `/app/posts/${id}/edit` : "/app/posts/new";
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
  redirect(`/app/posts/${data}`);
}
export async function postAction(f: FormData) {
  const { db } = await session();
  const id = field(f, "id");
  const action = field(f, "action");
  const { error } = await db.rpc("post_action", { p_id: id, p_action: action });
  if (error) fail(`/app/posts/${id}`, error.message);
  revalidatePath("/", "layout");
  redirect(action === "delete" ? "/app/history" : `/app/posts/${id}`);
}
export async function addSupplement(f: FormData) {
  const { db } = await session();
  const id = field(f, "id"),
    body = field(f, "body");
  if (!body || Array.from(body).length > 100)
    fail(`/app/posts/${id}`, "補足は1〜100文字で入力してください。");
  const { error } = await db.rpc("add_supplement", { p_id: id, p_body: body });
  if (error) fail(`/app/posts/${id}`, error.message);
  revalidatePath(`/app/posts/${id}`);
  redirect(`/app/posts/${id}`);
}
export async function deleteSupplement(f: FormData) {
  const { db } = await session();
  const id = field(f, "id");
  const { error } = await db.rpc("delete_supplement", {
    s_id: field(f, "supplement_id"),
  });
  if (error) fail(`/app/posts/${id}`, error.message);
  revalidatePath(`/app/posts/${id}`);
  redirect(`/app/posts/${id}`);
}
