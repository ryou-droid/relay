import { NextResponse, type NextRequest } from "next/server";
import { configured, supabase } from "@/lib/supabase";
import { logRecoveryError } from "@/lib/password-recovery.mjs";
function destination(path: string) {
  // Fixed relative destinations work through proxies without trusting forwarded hosts.
  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: path,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
export async function GET(request: NextRequest) {
  if (!configured()) return destination("/setup");
  const token_hash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const code = request.nextUrl.searchParams.get("code");
  const flowId = request.nextUrl.searchParams.get("sb_flow_id");
  if (code && code.length <= 2048 && (!flowId || flowId.length <= 128)) {
    try {
      const db = await supabase();
      const { data, error } = await db.auth.exchangeCodeForSession(
        code,
        flowId ? { flowId } : undefined,
      );
      // The installed SDK returns this marker although its public type omits it.
      if (
        !error && data.user && data.session &&
        "redirectType" in data && data.redirectType === "recovery"
      )
        return destination("/reset-password");
      if (error) logRecoveryError("exchange_code", error);
      // A sign-in/sign-up code is not a password recovery request.
      if (!error) await db.auth.signOut({ scope: "local" });
    } catch (error) {
      logRecoveryError("exchange_code", error);
    }
  }
  if (!code && token_hash && token_hash.length <= 2048 && type === "recovery") {
    try {
      const db = await supabase();
      const { data, error } = await db.auth.verifyOtp({
        token_hash,
        type: "recovery",
      });
      if (!error && data.user && data.session)
        return destination("/reset-password");
      if (error) logRecoveryError("verify_link", error);
    } catch (error) {
      logRecoveryError("verify_link", error);
    }
  }
  return destination(
    "/forgot-password?error=" +
      encodeURIComponent(
        "再設定リンクが無効または期限切れです。メールを再送してください。",
      ),
  );
}
