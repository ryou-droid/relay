import { supabase } from "@/lib/supabase";
import { uuid } from "@/lib/push/protocol";
export async function POST(request: Request) {
  const reply = (allowed: boolean) => Response.json({ allowed }, { headers: { "Cache-Control": "no-store" } });
  try {
    if (Number(request.headers.get("content-length") || 0) > 256) return reply(false);
    const { event_id } = await request.json();
    if (!uuid(event_id)) return reply(false);
    const db = await supabase();
    const { data: { user }, error } = await db.auth.getUser();
    if (error || !user) return reply(false);
    const result = await db.rpc("can_show_push", { p_id: event_id });
    return reply(!result.error && result.data === true);
  } catch { return reply(false); }
}
