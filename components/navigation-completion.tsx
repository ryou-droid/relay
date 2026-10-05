"use client";
import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { finishNavigationFeedback } from "@/lib/navigation-feedback";

export default function NavigationCompletion() {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  useEffect(() => { finishNavigationFeedback(); }, [pathname, query]);
  useEffect(() => {
    window.addEventListener("pagehide", finishNavigationFeedback);
    return () => { window.removeEventListener("pagehide", finishNavigationFeedback); finishNavigationFeedback(); };
  }, []);
  return null;
}
