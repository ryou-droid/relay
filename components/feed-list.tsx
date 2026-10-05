"use client";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "@/components/navigation-link";
import PostCard from "@/components/post-card";
import RouteSkeleton from "@/components/route-skeleton";
import { loadFeed } from "@/app/feed-actions";
import { homeFilters, historyFilters, type FeedPage, type HomePages } from "@/lib/feed";

// Sample time from event/effect handlers, never during rendering.
const now = () => Date.now();

export default function FeedList({ view, initialPages, initialFilter }: { view: "home" | "history"; initialPages: HomePages; initialFilter: string }) {
  const router = useRouter();
  const [active, setActive] = useState(initialFilter);
  const [pages, setPages] = useState(initialPages);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const loadedAt = useRef(0);
  const filterTimes = useRef<Record<string, number>>({});
  const pending = useRef(new Set<string>());
  const generation = useRef(0);
  const filters = view === "home" ? homeFilters : historyFilters;
  useEffect(() => {
    generation.current++;
    const epoch = generation.current;
    loadedAt.current = now(); filterTimes.current = {}; pending.current.clear();
    return () => { generation.current = epoch + 1; };
  }, []);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible" && now() - loadedAt.current >= 30000) router.refresh(); };
    document.addEventListener("visibilitychange", refresh);
    return () => { document.removeEventListener("visibilitychange", refresh); };
  }, [router]);

  async function retrieve(filter: string, append = false) {
    if (pending.current.has(filter)) return;
    pending.current.add(filter); setBusy(true); setError(false);
    const version = generation.current;
    try {
      const result = await loadFeed(view, filter, append ? pages[filter]?.next : null);
      if (version !== generation.current) return;
      if (!append) filterTimes.current[filter] = now();
      setPages(previous => ({ ...previous, [filter]: append ? {
        ...result, items: Array.from(new Map([...(previous[filter]?.items || []), ...result.items].map(item => [item.post.id, item])).values()),
      } : result }));
    } catch { if (version === generation.current) setError(true); }
    finally { if (version === generation.current) { pending.current.delete(filter); setBusy(pending.current.size > 0); } }
  }
  function select(filter: string) {
    // Urgent UI state, independent of server actions. Native history updates do not fetch RSC.
    flushSync(() => { setActive(filter); setError(false); });
    window.history.replaceState(null, "", `${view === "home" ? "/app?category=" : "/app/history?tab="}${filter}`);
    if (!pages[filter] || now() - (filterTimes.current[filter] || loadedAt.current) >= 30000) void retrieve(filter);
  }
  const page: FeedPage | undefined = pages[active];
  return <>
    <nav className="categories" aria-label={view === "home" ? "投稿カテゴリ" : "履歴カテゴリ"}>
      {filters.map(([key, label]) => <button type="button" key={key} className={active === key ? "active" : ""} aria-pressed={active === key} onClick={() => select(key)}>{label}</button>)}
    </nav>
    {view === "home" && <div className="list-heading"><h2>{filters.find(([key]) => key === active)?.[1]}</h2><span>{page ? `${page.items.length} 件${page.next ? "以上" : ""}` : ""}</span></div>}
    {error && <p className="error" role="alert">一覧を取得できません。<button className="secondary" onClick={() => void retrieve(active)}>再試行</button></p>}
    {!page ? <RouteSkeleton /> : <>
      <div className="post-grid">{page.items.map(item => <PostCard key={item.post.id} post={item.post} summary={item.summary} />)}</div>
      {!page.items.length && <div className="empty"><h2>{view === "home" ? "投稿はありません" : "履歴はありません"}</h2>{view === "home" && <Link className="button" href="/app/posts/new">投稿する</Link>}</div>}
      {page.next && <div className="feed-more"><button className="secondary" disabled={busy} onClick={() => void retrieve(active, true)}>{busy ? "読み込み中…" : "さらに表示"}</button></div>}
    </>}
  </>;
}
