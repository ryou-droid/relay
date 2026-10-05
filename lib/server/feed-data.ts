import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { homeFilters, type FeedCursor, type FeedPage, type HomePages } from "../feed";
import type { Post, Summary } from "../domain";
import { timedQuery } from "./performance";
const missing = (error: { code?: string } | null) => error?.code === "PGRST202";
// Compatibility until the new migration is applied. Never fall back on permission failures.
async function legacy(db: SupabaseClient) {
  const [posts, summaries] = await Promise.all([
    timedQuery("feed.legacy_posts", () => db.from("posts").select("id,author_id,title,kind,priority,status,due_at,created_at,completed_at").order("created_at", { ascending: false }).order("id", { ascending: false })),
    timedQuery("feed.legacy_summaries", () => db.rpc("post_summaries")),
  ]);
  return { posts: (posts.data || []) as Post[], summaries: new Map(((summaries.data || []) as Summary[]).map(item => [item.post_id, item])), error: posts.error || summaries.error };
}
function pageOf(source: Awaited<ReturnType<typeof legacy>>, view: "home" | "history", filter: string, userId: string, cursor: FeedCursor | null): FeedPage {
  const now = new Date();
  const day = (date: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(date);
  const visible = source.posts.filter(post => {
    if (cursor && !(new Date(post.created_at).getTime() < Date.parse(cursor.created_at) || (Date.parse(post.created_at) === Date.parse(cursor.created_at) && post.id < cursor.id))) return false;
    const summary = source.summaries.get(post.id);
    if (view === "history") return filter === "mine" ? post.author_id === userId : filter === "involved" ? summary?.involved : post.status === "completed";
    if (filter === "today") return post.status === "completed" && post.completed_at && day(new Date(post.completed_at)) === day(now);
    if (post.status === "completed") return false;
    return filter === "important" ? post.priority === "high" : filter === "overdue" ? new Date(post.due_at) < now : filter === "unread" ? !summary?.is_read : filter === "progress" ? post.status === "in_progress" : true;
  });
  const posts = visible.slice(0,30);
  return { items: posts.map(post => ({ post: { id: post.id, title: post.title, kind: post.kind, priority: post.priority, status: post.status, due_at: post.due_at, created_at: post.created_at, completed_at: post.completed_at }, summary: source.summaries.get(post.id) || { post_id: post.id, read_count: 0, member_count: 0, is_read: false, involved: false, assignee_names: [] } })), next: visible.length > 30 ? { created_at: posts[29].created_at, id: posts[29].id } : null };
}
export async function readHomeFeed(db: SupabaseClient) {
  const result = await timedQuery("home.feed", () => db.rpc("home_feed"));
  if (!missing(result.error)) return { data: result.data as HomePages | null, error: result.error };
  const source = await legacy(db);
  return { data: Object.fromEntries(homeFilters.map(([key]) => [key,pageOf(source,"home",key,"",null)])) as HomePages, error: source.error };
}
export async function readFeed(db: SupabaseClient, view: "home" | "history", filter: string, cursor: FeedCursor | null = null, resolveUserId?: () => Promise<string>) {
  const result = await timedQuery(`feed.${view}`, () => db.rpc("post_feed", { p_view: view, p_filter: filter, p_before: cursor?.created_at || null, p_before_id: cursor?.id || null }));
  if (!missing(result.error)) return { data: result.data as FeedPage | null, error: result.error };
  const source = await legacy(db);
  // Needed only for the pre-migration "mine" fallback; getUser still verifies identity.
  const userId = filter === "mine" ? (resolveUserId ? await resolveUserId() : (await db.auth.getUser()).data.user?.id || "") : "";
  return { data: pageOf(source,view,filter,userId,cursor), error: source.error };
}
export async function readPostSummaries(db: SupabaseClient, ids: string[]) {
  const result = await timedQuery("detail.summaries", () => db.rpc("post_summaries_for", { p_ids: ids }));
  if (!missing(result.error)) return result;
  const fallback = await db.rpc("post_summaries");
  return { ...fallback, data: ((fallback.data || []) as Summary[]).filter(item => ids.includes(item.post_id)) };
}
