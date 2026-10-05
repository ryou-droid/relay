import { Suspense } from "react";
import HomeSkeleton from "@/components/home-skeleton";
import { readHomeFeed } from "@/lib/server/feed-data";
import { randomUUID } from "node:crypto";
import Link from "@/components/navigation-link";
import FeedList from "@/components/feed-list";
import { configured, supabase } from "@/lib/supabase";
import { session } from "@/lib/session";
import { homeFilters, type HomePages } from "@/lib/feed";
import { timedQuery, startTiming } from "@/lib/server/performance";
async function HomePosts({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const finish = startTiming("page.home.posts");
  if (!configured()) await session();
  const verified = session();
  const reading = (async () => {
    const db = await supabase();
    const query = await searchParams;
    const category = homeFilters.some(([key]) => key === query.category) ? query.category! : "new";
    const feed = await readHomeFeed(db);
    return { feed, category };
  })();
  const [, { feed, category }] = await Promise.all([verified, reading]);
  if (feed.error) throw new Error("一覧を取得できません。DB設定を確認してください。");
  finish();
  return <FeedList key={randomUUID()} view="home" initialPages={feed.data as HomePages} initialFilter={category} />;
}
async function HomeNotices() {
  if (!configured()) await session();
  const verified = session();
  const reading = (async () => {
    const db = await supabase();
    return timedQuery("home.notices", () => db.from("important_notices").select("id,body,department_id").eq("active", true));
  })();
  const [, notices] = await Promise.all([verified, reading]);
  if (notices.error) throw new Error("重要連絡を取得できません。DB設定を確認してください。");
  return Boolean(notices.data?.length) && <section className="important-stack" aria-label="重要連絡">{[false, true].map(dept => {
    const notice = notices.data?.find(item => Boolean(item.department_id) === dept);
    return notice ? <div className="important-notice" key={String(dept)}><strong>{dept ? "部署" : "組織"}重要連絡</strong><p>{notice.body}</p></div> : null;
  })}</section>;
}
export default function Home(props: { searchParams: Promise<{ category?: string }> }) {
  return <>
    <div className="page-heading"><h1>今日の引き継ぎ</h1><Link className="button desktop-create" href="/app/posts/new">＋ 新しく投稿</Link></div>
    <Suspense fallback={null}><HomeNotices /></Suspense>
    <Suspense fallback={<HomeSkeleton />}><HomePosts {...props} /></Suspense>
  </>;
}
