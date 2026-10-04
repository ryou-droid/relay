export const kinds = {
  notice: "連絡",
  caution: "注意",
  handover: "引き継ぎ",
  request: "対応依頼",
};
export const priorities = { low: "低", normal: "通常", high: "高" };
export const statuses = {
  pending: "未対応",
  in_progress: "対応中",
  completed: "完了",
};
export type Post = {
  id: string;
  author_id: string;
  title: string;
  body: string;
  kind: keyof typeof kinds;
  priority: keyof typeof priorities;
  status: keyof typeof statuses;
  due_at: string;
  created_at: string;
  completed_at: string | null;
  accepted_at: string | null;
  deleted_at: string | null;
};
export type Member = { user_id: string; display_name: string };
export type Summary = {
  post_id: string;
  read_count: number;
  member_count: number;
  is_read: boolean;
  involved: boolean;
  assignee_names: string[];
};
export function deadline(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
