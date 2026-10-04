"use client";
import { useFormStatus } from "react-dom";
export default function PasswordSubmit({
  children,
}: {
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return <button disabled={pending}>{pending ? "処理中…" : children}</button>;
}
