"use client";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { approveUser } from "@/app/admin/actions";
import type { Department } from "@/lib/admin";

function ApproveButton({ selected }: { selected: boolean }) {
  const { pending } = useFormStatus();
  return <button className="approval-submit" disabled={!selected || pending}>{pending ? "承認しています…" : "承認する"}</button>;
}
export function ApprovalForm({ requestId, departments }: { requestId: string; departments: Department[] }) {
  const [selected, select] = useState("");
  return <form action={approveUser} className="approval-form">
    <input type="hidden" name="request_id" value={requestId} />
    <fieldset><legend>所属部署を選択</legend><div className="department-picker">
      {departments.map((department) => <label key={department.id} className={selected === department.id ? "department-option selected" : "department-option"}>
        <input type="radio" name="department_id" value={department.id} checked={selected === department.id} onChange={() => select(department.id)} required />
        <span>{department.name}</span><span aria-hidden="true">{selected === department.id ? "✓" : ""}</span>
      </label>)}
    </div></fieldset>
    {!departments.length && <p className="notice">選択できる部署がありません。組織管理者に部署の登録を依頼してください。</p>}
    <ApproveButton selected={Boolean(selected)} />
  </form>;
}
