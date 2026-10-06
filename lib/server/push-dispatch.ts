import "server-only";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { pushConfigured } from "./push-config";
import { drainPushQueue } from "../push/dispatcher";
export async function dispatchPostNotifications(post?: string) {
  if (!pushConfigured()) return { sent: 0, retry: 0, skipped: 0 };
  try {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
    return await drainPushQueue({ key: process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY!, post,
      rpc: (name, args) => db.rpc(name, args),
      send: (job, payload) => webpush.sendNotification({ endpoint: job.endpoint, keys: { p256dh: job.p256dh, auth: job.auth_key } }, payload, {
        vapidDetails: { subject: process.env.WEB_PUSH_SUBJECT!, publicKey: process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY!, privateKey: process.env.WEB_PUSH_PRIVATE_KEY! },
        TTL: 60, timeout: 5000, urgency: "normal",
      }),
    });
  } catch {
    // Never log provider errors: they can contain subscription URLs and headers.
    console.error("relay.push.dispatch_failed");
    return { sent: 0, retry: 0, skipped: 0 };
  }
}
