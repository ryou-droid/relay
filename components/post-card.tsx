import Link from "next/link";
import {
  kinds,
  statuses,
  deadline,
  type Post,
  type Summary,
} from "@/lib/domain";
export default function PostCard({
  post,
  summary,
}: {
  post: Post;
  summary?: Summary;
}) {
  const overdue =
    post.status !== "completed" && new Date(post.due_at) < new Date();
  return (
    <Link href={`/app/posts/${post.id}`} className="post-card">
      <div className="card-top">
        <span className={`kind ${post.priority === "high" ? "high" : ""}`}>
          {kinds[post.kind]}
        </span>
        <span className={`status ${post.status}`}>{statuses[post.status]}</span>
      </div>
      <h2>{post.title}</h2>
      <p className={overdue ? "overdue" : ""}>
        ◷ 期限：{deadline(post.due_at)}
        {overdue && " ・期限超過"}
      </p>
      <div className="card-footer">
        <span>
          既読 {summary?.read_count ?? 0}/{summary?.member_count ?? 0}
        </span>
        <span>担当：{summary?.assignee_names?.join("・") || "指定なし"}</span>
      </div>
    </Link>
  );
}
