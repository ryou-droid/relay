"use client";
import { useState } from "react";
export default function CopyInvitation({ url }: { url: string }) {
  const [message, setMessage] = useState("");
  return <><button className="secondary" type="button" onClick={async () => {
    try { await navigator.clipboard.writeText(url); setMessage("コピーしました"); }
    catch { setMessage("登録リンクを長押ししてコピーしてください"); }
  }}>登録リンクをコピー</button><a href={url} className="invite-link">登録リンク</a>{message && <p role="status">{message}</p>}</>;
}
