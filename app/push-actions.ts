"use server";
import { session } from "@/lib/session";
import { validEndpoint, validSubscription } from "@/lib/push/protocol";
import { pushConfigured } from "@/lib/server/push-config";
export async function pushStatus(endpoint: string) {
  const { db, user } = await session();
  if (!validEndpoint(endpoint)) return false;
  const { data, error } = await db.from("push_subscriptions").select("enabled").eq("user_id", user.id).eq("endpoint", endpoint).maybeSingle();
  if (error) throw new Error("通知設定を確認できません。時間をおいてお試しください。");
  return Boolean(data?.enabled);
}
export async function enablePush(input: unknown) {
  const { db } = await session();
  if (!pushConfigured() || !validSubscription(input)) throw new Error("通知を設定できません。管理者に設定状況を確認してください。");
  const { error } = await db.rpc("save_push_subscription", {
    p_endpoint: input.endpoint, p_p256dh: input.keys.p256dh, p_auth: input.keys.auth,
    p_key: process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY!,
  });
  if (error) throw new Error("通知を設定できません。時間をおいてお試しください。");
}
export async function disablePush(endpoint: string) {
  const { db } = await session(false);
  if (!validEndpoint(endpoint)) throw new Error("通知設定を確認してください。");
  const { error } = await db.rpc("disable_push_subscription", { p_endpoint: endpoint });
  if (error) throw new Error("通知をOFFにできません。時間をおいてお試しください。");
}
