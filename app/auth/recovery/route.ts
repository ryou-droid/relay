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
  if (token_hash && token_hash.length <= 2048 && type === "recovery") {
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
