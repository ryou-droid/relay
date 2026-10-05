import { readHomeFeed } from "@/lib/server/feed-data";
import { randomUUID } from "node:crypto";
import Link from "@/components/navigation-link";
import FeedList from "@/components/feed-list";
import { configured, supabase } from "@/lib/supabase";
import { session } from "@/lib/session";
import { homeFilters, type HomePages } from "@/lib/feed";
import { timedQuery, startTiming } from "@/lib/server/performance";
export default async function Home({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const finish = startTiming("page.home");
  if (!configured()) await session();
  const verified = session();
  // Reads are scoped by RLS/RPC, and nothing is rendered before the server gate completes.
  const reading = (async () => {
    const db = await supabase();
    const query = await searchParams;
    const category = homeFilters.some(([key]) => key === query.category) ? query.category! : "new";
    const [feed, notices] = await Promise.all([
      readHomeFeed(db),
      timedQuery("home.notices", () => db.from("important_notices").select("id,body,department_id").eq("active", true)),
    ]);
    return { feed, notices, category };
  })();
  const [, { feed, notices, category }] = await Promise.all([verified, reading]);
  if (feed.error || notices.error) throw new Error("一覧を取得できません。DB設定を確認してください。");
  finish();
  return <>
    <div className="page-heading"><h1>今日の引き継ぎ</h1><Link className="button desktop-create" href="/app/posts/new">＋ 新しく投稿</Link></div>
    {Boolean(notices.data?.length) && <section className="important-stack" aria-label="重要連絡">{[false, true].map(dept => {
      const notice = notices.data?.find(item => Boolean(item.department_id) === dept);
      return notice ? <div className="important-notice" key={String(dept)}><strong>{dept ? "部署" : "組織"}重要連絡</strong><p>{notice.body}</p></div> : null;
    })}</section>}
    <FeedList key={randomUUID()} view="home" initialPages={feed.data as HomePages} initialFilter={category} />
  </>;
}
