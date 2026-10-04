"use client";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { savePost } from "@/app/actions";
import { kinds, priorities, type Member, type Post } from "@/lib/domain";
function Submit() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending}>{pending ? "保存中…" : "投稿を保存"}</button>
  );
}
function jstDate(date: Date) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(
    date,
  );
}
export default function PostForm({
  post,
  members,
  assignees = [],
  error,
}: {
  post?: Post;
  members: Member[];
  assignees?: string[];
  error?: string;
}) {
  const initial = post
    ? new Date(new Date(post.due_at).getTime() + 9 * 3600000)
        .toISOString()
        .slice(0, 16)
    : jstDate(new Date()) + "T18:00";
  const [date, setDate] = useState(initial.slice(0, 10));
  const [time, setTime] = useState(initial.slice(11));
  const [title, setTitle] = useState(post?.title || "");
  const [body, setBody] = useState(post?.body || "");
  return (
    <form action={savePost} className="panel post-form">
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <input type="hidden" name="id" value={post?.id || ""} />
      <div className="form-row">
        <label>
          種類
          <select name="kind" defaultValue={post?.kind || "handover"}>
            {Object.entries(kinds).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          重要度
          <select name="priority" defaultValue={post?.priority || "normal"}>
            {Object.entries(priorities).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        タイトル<span className="counter">{Array.from(title).length}/30</span>
        <input
          name="title"
          required
          maxLength={30}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="引き継ぎたいことを簡潔に"
        />
      </label>
      <label>
        内容<span className="counter">{Array.from(body).length}/300</span>
        <textarea
          name="body"
          required
          maxLength={300}
          rows={6}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="確認や対応に必要な情報を記入してください"
        />
      </label>
      <fieldset>
        <legend>
          期限 <span className="muted">日本時間・必須</span>
        </legend>
        <div className="quick-dates">
          <button
            type="button"
            className="secondary"
            onClick={() => setDate(jstDate(new Date()))}
          >
            今日
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => setDate(jstDate(new Date(Date.now() + 86400000)))}
          >
            明日
          </button>
        </div>
        <div className="form-row">
          <label>
            日付指定
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label>
            時刻
            <input
              type="time"
              required
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </label>
        </div>
        <input type="hidden" name="due_at" value={`${date}T${time}`} />
      </fieldset>
      <fieldset>
        <legend>担当者</legend>
        <p className="muted">選択なしは「指定なし」。複数人を選択できます。</p>
        <div className="members">
          {members.map((member) => (
            <label className="check-label" key={member.user_id}>
              <input
                type="checkbox"
                name="assignees"
                value={member.user_id}
                defaultChecked={assignees.includes(member.user_id)}
              />
              {member.display_name}
            </label>
          ))}
        </div>
      </fieldset>
      <Submit />
    </form>
  );
}
