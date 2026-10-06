"use client";
import { useEffect, useState } from "react";
import { enablePush, disablePush, pushStatus } from "@/app/push-actions";
function keyBytes(key: string): ArrayBuffer {
  const binary = atob(key.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - key.length % 4) % 4));
  return Uint8Array.from(binary, char => char.charCodeAt(0)).buffer;
}
export default function PushSettings({ configured }: { configured: boolean }) {
  const [enabled, setEnabled] = useState(false), [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false), [message, setMessage] = useState("");
  const key = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY;
  useEffect(() => {
    let active = true;
    void (async () => {
      await Promise.resolve();
      if (!active) return;
      if (!window.isSecureContext || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setMessage("iPhone・iPadではホーム画面に追加したRelayから設定してください（iOS 16.4以降）。"); return;
      }
      if (process.env.NODE_ENV !== "production" || !configured || !key) { setMessage("通知は準備中です。"); return; }
      try {
        const registration = await navigator.serviceWorker.getRegistration() || await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
        const supportsPush = await new Promise<boolean>(resolve => {
          const channel = new MessageChannel();
          const timeout = setTimeout(() => { channel.port1.close(); resolve(false); }, 1500);
          channel.port1.onmessage = event => { clearTimeout(timeout); channel.port1.close(); resolve(event.data?.newPostPush === true); };
          registration.active?.postMessage({ type: "relay-push-support" }, [channel.port2]);
        });
        if (!supportsPush) { if (active) setMessage("一度Relayと同じサイトのタブを閉じて開き直してください。"); return; }
        const subscription = await registration.pushManager.getSubscription();
        const on = subscription ? await pushStatus(subscription.endpoint) : false;
        if (active) { setEnabled(on); setReady(true); }
      } catch { if (active) setMessage("通知設定を確認できません。画面を開き直してください。"); }
    })();
    return () => { active = false; };
  }, [configured, key]);
  async function toggle() {
    if (busy || !ready || !key) return;
    setBusy(true); setMessage("");
    try {
      // Request permission synchronously from the explicit button gesture (required on iOS).
      const permission = enabled ? Notification.permission : await Notification.requestPermission();
      if (!enabled && permission !== "granted") { setMessage("通知は許可されていません。Relayはそのまま利用できます。"); return; }
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (enabled) {
        if (subscription) { await disablePush(subscription.endpoint); setEnabled(false); await subscription.unsubscribe(); }
        else setEnabled(false);
      } else {
        if (subscription && subscription.options.applicationServerKey && !new Uint8Array(subscription.options.applicationServerKey).every((byte, i) => byte === new Uint8Array(keyBytes(key))[i])) {
          await disablePush(subscription.endpoint); await subscription.unsubscribe(); subscription = null;
        }
        subscription ||= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
        try { await enablePush(subscription.toJSON()); }
        catch { await subscription.unsubscribe(); throw new Error("通知をONにできません。管理者に設定状況を確認してください。"); }
        setEnabled(true);
      }
    } catch { setMessage("通知設定を変更できません。時間をおいて再度お試しください。"); }
    finally { setBusy(false); }
  }
  return <section id="notifications" className="panel"><h2>新規投稿通知</h2><p>この端末：{enabled ? "ON" : "OFF"}</p>
    <button className={enabled ? "secondary" : ""} disabled={!ready || busy} onClick={toggle}>{busy ? "設定中…" : enabled ? "通知をOFFにする" : "通知をONにする"}</button>
    {message && <p role="status" className="muted">{message}</p>}
  </section>;
}
