import { readFeed } from "@/lib/server/feed-data";
import { randomUUID } from "node:crypto";
import FeedList from "@/components/feed-list";
import { configured, supabase } from "@/lib/supabase";
import { session } from "@/lib/session";
import { historyFilters, type FeedPage } from "@/lib/feed";
import { startTiming } from "@/lib/server/performance";
export default async function History({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const finish = startTiming("page.history");
  if (!configured()) await session();
  const verified = session();
  // Reads are scoped by RLS/RPC, and nothing is rendered before the server gate completes.
  const reading = (async () => {
    const db = await supabase();
    const query = await searchParams;
    const tab = historyFilters.some(([key]) => key === query.tab) ? query.tab! : "completed";
    const { data, error } = await readFeed(db, "history", tab, null, async () => (await verified).user.id);
    return { data, error, tab };
  })();
  const [, { data, error, tab }] = await Promise.all([verified, reading]);
  if (error) throw new Error("履歴を取得できません。DB設定を確認してください。");
  finish();
  return <><div className="page-heading"><h1>履歴</h1></div><FeedList key={randomUUID()} view="history" initialPages={{ [tab]: data as FeedPage }} initialFilter={tab} /></>;
}
