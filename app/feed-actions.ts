"use server";
import { session } from "@/lib/session";
import { homeFilters, historyFilters, type FeedCursor, type FeedPage } from "@/lib/feed";
import { readFeed } from "@/lib/server/feed-data";
export async function loadFeed(view: "home" | "history", filter: string, cursor: FeedCursor | null = null): Promise<FeedPage> {
  const filters = view === "home" ? homeFilters : view === "history" ? historyFilters : [];
  if (!filters.some(([key]) => key === filter) || (cursor && (!Number.isFinite(Date.parse(cursor.created_at)) || !/^[0-9a-f-]{36}$/i.test(cursor.id)))) throw new Error("取得条件が不正です。");
  const { db, user } = await session();
  const { data, error } = await readFeed(db, view, filter, cursor, async () => user.id);
  if (error) throw new Error("一覧を取得できません。再読み込みしてください。");
  return data as FeedPage;
}
