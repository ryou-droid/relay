import Link from "next/link";
import { adminDepartments, adminRead, type AdminUser } from "@/lib/admin";
import { createInvitation, manageUser, revokeInvitation } from "@/app/admin/actions";
import { AdminMessage } from "@/components/admin-message";

export default async function Users({ searchParams }: { searchParams: Promise<{ error?: string; message?: string; invite?: string }> }) {
  const context = await adminDepartments();
  const { db, user, membership, departments } = context;
  const organizationAdmin = membership!.role === "organization_admin";
  const [members, invitations] = await Promise.all([
    adminRead<AdminUser>(context, "admin_users"), db.from("organization_invitations").select("id,department_id,expires_at").eq("active", true).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }),
  ]);
  if (invitations.error) throw new Error("ユーザー情報を取得できません。");
  const query = await searchParams;
  const createdInvite = invitations.data?.find((invitation) => invitation.id === query.invite);
  const activeDepartments = departments.filter((department) => department.active);
  return <><h1>ユーザー</h1><p>{organizationAdmin ? "組織内の所属・権限・利用状態を管理します。" : "自部署の一般ユーザーの利用状態を管理します。"}</p><AdminMessage {...query} />
    <details className="panel invitations" open={Boolean(createdInvite)}><summary>参加用の招待コード</summary>
      <p>コードを渡して登録してもらうと、承認待ちに表示されます。招待だけでは組織データは見えません。</p>
      <form action={createInvitation}>
        {organizationAdmin ? <label>申請先<select name="department_id"><option value="">組織全体（承認時に部署を選択）</option>{activeDepartments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
          : <><input type="hidden" name="department_id" value={membership!.department_id} /><p>申請先：自部署</p></>}
        <button>招待コードを作成</button>
      </form>
      {createdInvite && <div className="notice" role="status"><p>招待コード（30日間有効）</p><code className="invite-code">{createdInvite.id}</code><p><Link href={`/register?invite=${createdInvite.id}`}>登録リンク（長押し・右クリックで共有）</Link></p></div>}
      <div className="admin-list">{invitations.data?.map((invitation) => <div key={invitation.id} className="invitation-row"><span>{departments.find((department) => department.id === invitation.department_id)?.name || "組織全体"}</span><Link href={`/register?invite=${invitation.id}`}>登録リンク</Link><form action={revokeInvitation}><input name="id" type="hidden" value={invitation.id} /><button className="secondary">無効化</button></form></div>)}</div>
    </details>
    <div className="admin-list">{members.map((member) => {
      const editable = member.user_id !== user.id && (organizationAdmin || member.role === "user");
      return <section className="panel" key={member.membership_id}><h2>{member.full_name}</h2><p>{member.email}</p><p className="muted">{member.department_name} ・ {member.position} ・ {member.suspended ? "利用停止中" : "利用中"}</p>
        {editable ? <form action={manageUser}><input type="hidden" name="membership_id" value={member.membership_id} />
          {organizationAdmin ? <><label>所属部署<select name="department_id" defaultValue={member.department_id}>{activeDepartments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label><label>権限<select name="role" defaultValue={member.role}><option value="user">一般ユーザー</option><option value="department_admin">部署管理者</option><option value="organization_admin">組織管理者</option></select></label></>
            : <><input type="hidden" name="department_id" value={member.department_id} /><input type="hidden" name="role" value="user" /></>}
          <label className="check-row"><input type="checkbox" name="suspended" defaultChecked={member.suspended} />利用を停止する</label><button className="secondary">変更を保存</button>
        </form> : <p className="muted">{member.user_id === user.id ? "自分の所属・権限・利用状態は別の組織管理者が変更します。" : "管理者の変更は組織管理者が行います。"}</p>}
      </section>;
    })}</div>
  </>;
}
