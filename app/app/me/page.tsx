import { session } from "@/lib/session";
import { logout } from "@/app/actions";
export default async function Me() {
  const { db, user, membership } = await session();
  const { data: profile, error } = await db
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (error) throw error;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">MY ACCOUNT</p>
          <h1>マイページ</h1>
        </div>
      </div>
      <section className="panel">
        <div className="avatar">
          {Array.from(profile.full_name)[0] as string}
        </div>
        <h2>{profile.full_name}</h2>
        <dl className="facts">
          <div>
            <dt>メール</dt>
            <dd>{user.email}</dd>
          </div>
          <div>
            <dt>役職</dt>
            <dd>{profile.position}</dd>
          </div>
          <div>
            <dt>権限</dt>
            <dd>
              {
                (
                  {
                    user: "一般ユーザー",
                    department_admin: "部署管理者",
                    organization_admin: "組織管理者",
                  } as Record<string, string>
                )[membership!.role]
              }
            </dd>
          </div>
        </dl>
        <p className="muted">
          所属・権限の変更は管理者へお問い合わせください。
        </p>
        <form action={logout}>
          <button className="secondary">ログアウト</button>
        </form>
      </section>
    </>
  );
}
