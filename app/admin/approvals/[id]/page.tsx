import { notFound } from "next/navigation";
import Link from "next/link";
import { adminDepartments, adminRead, type Approval } from "@/lib/admin";
import { ApprovalForm } from "@/components/approval-form";
import { AdminMessage } from "@/components/admin-message";

export default async function ApprovalDetail({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }>;
}) {
  const context = await adminDepartments(true);
  const { departments } = context;
  const { id } = await params;
  const data = await adminRead<Approval>(context, "admin_approvals");
  const request = data.find((item) => item.request_id === id);
  if (!request) notFound();
  return <><Link className="back" href="/admin/approvals">← 承認待ち</Link><h1>{request.full_name}</h1>
    <p>{request.email}</p><p className="muted">希望部署：{request.planned_department} ／ 役職：{request.position}</p>
    <AdminMessage {...await searchParams} />
    {request.email_confirmed ? <ApprovalForm key={id} requestId={id} departments={departments} /> : <p className="notice">本人のメール確認後に承認できます。</p>}
  </>;
}
