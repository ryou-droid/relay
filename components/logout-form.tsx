"use client";
import { useState } from "react";
import { logout } from "@/app/actions";
import { disablePush } from "@/app/push-actions";
export default function LogoutForm() {
  const [busy, setBusy] = useState(false);
  return <form action={async () => {
    setBusy(true);
    if ("serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          try { await disablePush(subscription.endpoint); } finally { await subscription.unsubscribe(); }
        }
      } catch { /* Logging out must still work if device/network cleanup fails. */ }
    }
    await logout();
  }}><button className="secondary" disabled={busy}>{busy ? "ログアウト中…" : "ログアウト"}</button></form>;
}
