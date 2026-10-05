import { adminDepartments } from "@/lib/admin";
import { disableNotice, saveNotice } from "@/app/admin/actions";
import { AdminMessage } from "@/components/admin-message";

type Notice = { id: string; department_id: string | null; body: string; active: boolean };
export default async function Notices({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const { db, membership, departments } = await adminDepartments(true);
  const { data, error } = await db.rpc("admin_notices");
  if (error) throw new Error("お知らせを取得できません。");
  const organizationAdmin = membership!.role === "organization_admin";
  return <><h1>お知らせ</h1><p>通常画面の上部に重要連絡として掲載します。各範囲で最大1件です。</p><AdminMessage {...await searchParams} />
    <section className="panel"><form action={saveNotice}>
      {organizationAdmin ? <label>掲載範囲<select name="department_id"><option value="">組織全体</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
        : <><input type="hidden" name="department_id" value={membership!.department_id} /><p>掲載範囲：自部署</p></>}
      <label>重要連絡<textarea name="body" maxLength={500} rows={5} required /></label><p className="muted">500文字まで。掲載中の重要連絡は、新しい内容に置き換わります。</p><button>掲載する</button>
    </form></section>
    <div className="admin-list">{(data as Notice[]).map((notice) => <section className="panel" key={notice.id}>
      <h2>{notice.department_id ? departments.find((department) => department.id === notice.department_id)?.name || "部署" : "組織全体"}</h2><p className="body-text">{notice.body}</p><p className="muted">{notice.active ? "掲載中" : "掲載終了"}</p>
      {notice.active && <form action={disableNotice}><input type="hidden" name="id" value={notice.id} /><button className="secondary">掲載を終了</button></form>}
    </section>)}</div>
  </>;
}
