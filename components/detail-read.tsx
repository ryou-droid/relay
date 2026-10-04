"use client";
import { useEffect, useRef, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
export default function DetailRead({ id }: { id: string }) {
  const router = useRouter();
  const done = useRef(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const db = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    );
    void db
      .rpc("post_action", { p_id: id, p_action: "read" })
      .then(({ error }) => {
        if (error) setError(true);
        else router.refresh();
      });
  }, [id, router]);
  return error ? (
    <p className="error" role="alert">
      既読を保存できませんでした。再読み込みしてください。
    </p>
  ) : null;
}
