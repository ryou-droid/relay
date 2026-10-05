import Link from "next/link";
import { session } from "@/lib/session";
import PostCard from "@/components/post-card";
import type { Post, Summary } from "@/lib/domain";
const categories = [
  ["important", "重要連絡"],
  ["overdue", "期限超過"],
  ["unread", "未確認"],
  ["progress", "対応中"],
  ["new", "新着"],
  ["today", "本日完了"],
];
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { db } = await session();
  const category = (await searchParams).category || "new";
  const [p, s, n] = await Promise.all([
    db.from("posts").select("*").order("created_at", { ascending: false }),
    db.rpc("post_summaries"),
    db
      .from("important_notices")
      .select("id,body,department_id")
      .eq("active", true),
  ]);
  if (p.error || s.error || n.error)
    throw new Error("データ取得に失敗しました");
  const summaries = (s.data || []) as Summary[];
  const now = new Date();
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
  }).format(now);
  const posts = (p.data as Post[]).filter((post) => {
    const summary = summaries.find((x) => x.post_id === post.id);
    if (category === "today")
      return (
        post.status === "completed" &&
        post.completed_at &&
        new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(
          new Date(post.completed_at),
        ) === today
      );
    if (post.status === "completed") return false;
    if (category === "important") return post.priority === "high";
    if (category === "overdue") return new Date(post.due_at) < now;
    if (category === "unread") return !summary?.is_read;
    if (category === "progress") return post.status === "in_progress";
    return true;
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">TEAM WORKSPACE</p>
          <h1>今日の引き継ぎ</h1>
          <p>確認と対応を、ひとつずつ。</p>
        </div>
        <Link className="button desktop-create" href="/app/posts/new">
          ＋ 新しく投稿
        </Link>
      </div>
      <section className="important-stack" aria-label="重要連絡">
        {[false, true].map((dept) => {
          const notice = n.data?.find((x) => Boolean(x.department_id) === dept);
          return (
            <div className="important-notice" key={String(dept)}>
              <strong>{dept ? "部署" : "組織"}重要連絡</strong>
              <p>{notice?.body || "現在、重要連絡はありません"}</p>
            </div>
          );
        })}
      </section>
      <nav className="categories" aria-label="投稿カテゴリ">
        {categories.map(([key, label]) => (
          <Link
            key={key}
            href={`/app?category=${key}`}
            className={category === key ? "active" : ""}
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="list-heading">
        <h2>{categories.find((x) => x[0] === category)?.[1] || "新着"}</h2>
        <span>{posts.length} 件</span>
      </div>
      <div className="post-grid">
        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            summary={summaries.find((x) => x.post_id === post.id)}
          />
        ))}
      </div>
      {!posts.length && (
        <div className="empty">
          <span>✓</span>
          <h2>表示する投稿はありません</h2>
          <p>必要な連絡や引き継ぎを投稿しましょう。</p>
          <Link href="/app/posts/new">新しく投稿する →</Link>
        </div>
      )}
    </>
  );
}
