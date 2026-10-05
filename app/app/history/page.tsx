import Link from "@/components/navigation-link";
import { session } from "@/lib/session";
import PostCard from "@/components/post-card";
import type { Post, Summary } from "@/lib/domain";
const tabs = [
  ["completed", "完了した投稿"],
  ["mine", "自分の投稿"],
  ["involved", "関わった投稿"],
];
export default async function History({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { db, user } = await session();
  const tab = (await searchParams).tab || "completed";
  const [p, s] = await Promise.all([
    db.from("posts").select("*").order("created_at", { ascending: false }),
    db.rpc("post_summaries"),
  ]);
  if (p.error || s.error) throw new Error("履歴取得に失敗しました");
  const summaries = s.data as Summary[];
  const posts = (p.data as Post[]).filter((x) =>
    tab === "mine"
      ? x.author_id === user.id
      : tab === "involved"
        ? summaries.find((s) => s.post_id === x.id)?.involved
        : x.status === "completed",
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>履歴</h1>
        </div>
      </div>
      <nav className="categories">
        {tabs.map(([v, l]) => (
          <Link
            className={tab === v ? "active" : ""}
            href={`/app/history?tab=${v}`}
            key={v}
          >
            {l}
          </Link>
        ))}
      </nav>
      <div className="post-grid">
        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            summary={summaries.find((s) => s.post_id === post.id)}
          />
        ))}
      </div>
      {!posts.length && <div className="empty">履歴はありません</div>}
    </>
  );
}
