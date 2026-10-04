import { NextResponse, type NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
export async function GET(request: NextRequest) {
  const token_hash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  if (token_hash && type === "email") {
    const db = await supabase();
    const { error } = await db.auth.verifyOtp({ token_hash, type: "email" });
    if (!error) return NextResponse.redirect(new URL("/waiting", request.url));
  }
  return NextResponse.redirect(
    new URL(
      "/login?error=" +
        encodeURIComponent("確認リンクが無効または期限切れです。"),
      request.url,
    ),
  );
}
