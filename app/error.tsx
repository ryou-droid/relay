"use client";
import { useEffect } from "react";
import { finishNavigationFeedback } from "@/lib/navigation-feedback";
export default function ErrorPage({ reset }: { reset: () => void }) {
  useEffect(() => { finishNavigationFeedback(); }, []);
  return (
    <main className="auth">
      <h1>読み込みに失敗しました</h1>
      <p>接続または設定を確認し、再度お試しください。</p>
      <button onClick={reset}>再試行</button>
    </main>
  );
}
