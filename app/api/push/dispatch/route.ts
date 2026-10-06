import { timingSafeEqual } from "node:crypto";
import { dispatchPostNotifications } from "@/lib/server/push-dispatch";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const secret = process.env.PUSH_DISPATCH_TOKEN;
  const expected = Buffer.from(`Bearer ${secret || ""}`);
  const actual = Buffer.from(request.headers.get("authorization") || "");
  if (!secret || secret.length < 32 || actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const counts = await dispatchPostNotifications();
  return Response.json(counts, { headers: { "Cache-Control": "no-store" } });
}
