import { session } from "@/lib/session";
import { notFound, redirect } from "next/navigation";
import PostForm from "@/components/post-form";
export default async function Edit({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { db, user } = await session();
  const { id } = await params;
  const { data: post } = await db
    .from("posts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!post) notFound();
  if (post.author_id !== user.id || post.accepted_at) redirect(`/posts/${id}`);
  const [m, a] = await Promise.all([
    db.rpc("department_members"),
    db.from("post_assignees").select("user_id").eq("post_id", id),
  ]);
  if (m.error || a.error) throw new Error("取得に失敗しました");
  return (
    <>
      <h1>投稿を編集</h1>
      <PostForm
        post={post}
        members={m.data || []}
        assignees={a.data?.map((x) => x.user_id)}
        error={(await searchParams).error}
      />
    </>
  );
}
