"use client";

import { useEffect } from "react";

export function PwaRegistration() {
  useEffect(() => {
    // Avoid stale Next.js development assets and interference with hot reload.
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    if (!window.isSecureContext) return;
    navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    }).catch(() => {
      console.warn("Relayのオフライン機能を準備できませんでした。");
    });
  }, []);
  return null;
}
