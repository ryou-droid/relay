import { session } from "@/lib/session";
import PostForm from "@/components/post-form";
export const maxDuration = 60;
export default async function NewPost({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { db } = await session();
  const { data, error } = await db.rpc("department_members");
  if (error) throw error;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>新しく投稿</h1>
        </div>
      </div>
      <PostForm members={data || []} error={(await searchParams).error} />
    </>
  );
}
