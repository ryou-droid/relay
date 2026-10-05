import { notFound } from "next/navigation";
import Link from "next/link";
import { adminDepartments, type Approval } from "@/lib/admin";
import { ApprovalForm } from "@/components/approval-form";
import { AdminMessage } from "@/components/admin-message";

export default async function ApprovalDetail({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }>;
}) {
  const { db, departments } = await adminDepartments(true);
  const { id } = await params;
  const { data, error } = await db.rpc("admin_approvals");
  if (error) throw new Error("参加申請を取得できません。");
  const request = (data as Approval[]).find((item) => item.request_id === id);
  if (!request) notFound();
  return <><Link className="back" href="/admin/approvals">← 承認待ち</Link><h1>{request.full_name}</h1>
    <p>{request.email}</p><p className="muted">希望部署：{request.planned_department} ／ 役職：{request.position}</p>
    <AdminMessage {...await searchParams} />
    {request.email_confirmed ? <ApprovalForm key={id} requestId={id} departments={departments} /> : <p className="notice">本人のメール確認後に承認できます。</p>}
  </>;
}
