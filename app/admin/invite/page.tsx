import { adminSession } from "@/lib/admin";
import { createQrInvitation } from "@/app/admin/actions";
import { AdminMessage } from "@/components/admin-message";
import CopyInvitation from "@/components/copy-invitation";
import { invitationUrl, invitationQr } from "@/lib/invitation-qr";
import { timedQuery } from "@/lib/server/performance";
export default async function Invite({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { db } = await adminSession(true);
  const { data, error } = await timedQuery("admin.qr_invitations", () => db.rpc("qr_invitations"));
  if (error) throw new Error("招待を取得できません。招待用SQLの適用を確認してください。");
  const invitations = (data || []) as { id: string; invite_type: "user" | "admin"; expires_at: string }[];
  return <><h1>招待</h1><AdminMessage {...await searchParams} /><div className="qr-invitations">{(["user", "admin"] as const).map(kind => {
    const invitation = invitations.find(item => item.invite_type === kind);
    const url = invitation ? invitationUrl(invitation.id, kind) : null;
    return <section key={kind} className="qr-invitation"><h2>{kind === "user" ? "一般ユーザーを招待" : "管理者を招待"}</h2>
      {url ? <><div className="invite-qr" role="img" aria-label={`${kind === "user" ? "一般ユーザー" : "管理者候補"}登録用QRコード`} dangerouslySetInnerHTML={{ __html: invitationQr(url) }} /><CopyInvitation url={url} /></>
        : <form action={createQrInvitation}><input type="hidden" name="invite_type" value={kind} /><button>QRコードを表示</button></form>}
    </section>;
  })}</div></>;
}
