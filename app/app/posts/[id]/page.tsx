import Link from "@/components/navigation-link";
import { notFound } from "next/navigation";
import { session } from "@/lib/session";
import {
  kinds,
  priorities,
  statuses,
  deadline,
  type Summary,
} from "@/lib/domain";
import { postAction, addSupplement, deleteSupplement } from "@/app/actions";
import DetailRead from "@/components/detail-read";
import ConfirmButton from "@/components/confirm-button";
const actionNames: Record<string, string> = {
  created: "投稿を作成",
  edited: "投稿を編集",
  accepted: "対応を開始",
  confirmed: "確認しました",
  status_changed: "状態を変更",
  added_supplement: "補足を追加",
  deleted_supplement: "補足を削除",
  deleted_post: "投稿を削除",
};
export default async function Detail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { db, user } = await session();
  const [postResult, s, m, supp, logs] = await Promise.all([
    db.from("posts").select("*").eq("id", id).maybeSingle(),
    db.rpc("post_summaries"),
    db.rpc("department_members"),
    db.from("supplements").select("*").eq("post_id", id).order("created_at"),
    db
      .from("activity_logs")
      .select("*")
      .eq("post_id", id)
      .order("created_at", { ascending: false }),
  ]);
  const { data: post, error } = postResult;
  if (error || !post) notFound();
  if (s.error || m.error || supp.error || logs.error)
    throw new Error("詳細の取得に失敗しました");
  const summary = (s.data as Summary[])?.find((x) => x.post_id === id);
  const name = (uid: string) =>
    m.data?.find((x: { user_id: string }) => x.user_id === uid)?.display_name ||
    "以前のメンバー";
  const pageError = (await searchParams).error;
  return (
    <>
      <Link className="back" href="/app">
        ← ホームへ
      </Link>
      <DetailRead key={id} id={id} alreadyRead={Boolean(summary?.is_read)} />
      {pageError && (
        <p className="error" role="alert">
          {pageError}
        </p>
      )}
      <article className="panel detail">
        <div className="card-top">
          <span className="kind">{kinds[post.kind as keyof typeof kinds]}</span>
          <span className={`status ${post.status}`}>
            {statuses[post.status as keyof typeof statuses]}
          </span>
        </div>
        <h1>{post.title}</h1>
        <dl className="facts">
          <div>
            <dt>重要度</dt>
            <dd>{priorities[post.priority as keyof typeof priorities]}</dd>
          </div>
          <div>
            <dt>期限</dt>
            <dd>{deadline(post.due_at)} JST</dd>
          </div>
          <div>
            <dt>担当者</dt>
            <dd>{summary?.assignee_names.join("・") || "指定なし"}</dd>
          </div>
          <div>
            <dt>既読</dt>
            <dd>
              {summary?.read_count || 0}/{summary?.member_count || 0} 人
            </dd>
          </div>
        </dl>
        <p className="post-body">{post.body}</p>
        <p className="muted">
          投稿：{name(post.author_id)} · {deadline(post.created_at)}
        </p>
        <div className="action-grid">
          {[
            ["confirm", "確認しました"],
            ["accept", "対応します"],
            ["complete", "完了にする"],
          ].map(([action, label]) => (
            <form key={action} action={postAction}>
              <input type="hidden" name="id" value={id} />
              <button
                name="action"
                value={action}
                className={action === "complete" ? "" : "secondary"}
                disabled={post.status === "completed" && action !== "confirm"}
              >
                {label}
              </button>
            </form>
          ))}
        </div>
        <form action={postAction} className="status-form">
          <input type="hidden" name="id" value={id} />
          <label>
            状態変更
            <select
              name="action"
              defaultValue={
                post.status === "completed" ? "complete" : post.status
              }
            >
              {[
                ["pending", "未対応"],
                ["in_progress", "対応中"],
                ["complete", "完了"],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <button className="secondary">変更</button>
        </form>
        {post.author_id === user.id && (
          <div className="owner-actions">
            {post.accepted_at ? (
              <p className="muted">
                対応が開始されたため、この投稿は編集できません。
              </p>
            ) : (
              <Link href={`/app/posts/${id}/edit`}>投稿を編集</Link>
            )}
            <form action={postAction}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="action" value="delete" />
              <ConfirmButton>投稿を削除</ConfirmButton>
            </form>
          </div>
        )}
      </article>
      <section className="panel">
        <h2>補足</h2>
        {supp.data?.map((item) => (
          <div className="supplement" key={item.id}>
            <strong>{name(item.author_id)}</strong>
            <time>{deadline(item.created_at)}</time>
            <p>{item.body}</p>
            {item.author_id === user.id && (
              <form action={deleteSupplement}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="supplement_id" value={item.id} />
                <ConfirmButton>補足を削除</ConfirmButton>
              </form>
            )}
          </div>
        ))}
        <form action={addSupplement}>
          <input type="hidden" name="id" value={id} />
          <label>
            補足を追加
            <textarea
              name="body"
              rows={3}
              required
              maxLength={100}
              placeholder="100文字まで"
            />
          </label>
          <button>補足を保存</button>
        </form>
      </section>
      <section className="panel">
        <h2>操作履歴</h2>
        <ol className="activity">
          {logs.data?.map((log) => (
            <li key={log.id}>
              <strong>{name(log.actor_id)}</strong>：
              {actionNames[log.action] || log.action}
              {log.from_status && (
                <>
                  （{statuses[log.from_status as keyof typeof statuses]} →{" "}
                  {statuses[log.to_status as keyof typeof statuses]}）
                </>
              )}
              {log.action === "deleted_supplement" && (
                <p>削除した補足：{log.target_title}</p>
              )}
              <time>{deadline(log.created_at)}</time>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
