import { adminSession, adminDepartments } from "@/lib/admin";
import { saveDepartment } from "@/app/admin/actions";
import { AdminMessage } from "@/components/admin-message";

export default async function Departments({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  await adminSession(true);
  const { departments } = await adminDepartments();
  return <><h1>部署</h1><p>承認時に選べる部署を、先に登録します。</p><AdminMessage {...await searchParams} />
    <section className="panel"><h2>部署を追加</h2><form action={saveDepartment}><label>部署名<input name="name" required maxLength={100} placeholder="例：営業部" /></label><input type="hidden" name="active" value="on" /><button>部署を追加</button></form></section>
    <div className="admin-list">{departments.map((department) => <section className="panel" key={department.id}><form action={saveDepartment}>
      <input type="hidden" name="id" value={department.id} /><label>部署名<input name="name" required maxLength={100} defaultValue={department.name} /></label>
      <label className="check-row"><input type="checkbox" name="active" defaultChecked={department.active} />有効（承認時に表示）</label><button className="secondary">変更を保存</button>
    </form></section>)}</div><p className="muted">所属ユーザーのいる部署は無効化できません。部署名は無効化済みのものを含め、組織内で重複できません。</p>
  </>;
}
