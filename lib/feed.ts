import type { Post, Summary } from "./domain";
export const homeFilters = [["important", "重要連絡"], ["overdue", "期限超過"], ["unread", "未確認"], ["progress", "対応中"], ["new", "新着"], ["today", "本日完了"]] as const;
export const historyFilters = [["completed", "完了した投稿"], ["mine", "自分の投稿"], ["involved", "関わった投稿"]] as const;
export type FeedPost = Pick<Post, "id" | "title" | "kind" | "priority" | "status" | "due_at" | "created_at" | "completed_at">;
export type FeedItem = { post: FeedPost; summary: Summary };
export type FeedCursor = { created_at: string; id: string };
export type FeedPage = { items: FeedItem[]; next: FeedCursor | null };
export type HomePages = Record<string, FeedPage>;
