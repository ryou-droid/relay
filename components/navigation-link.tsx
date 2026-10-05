"use client";
import Link, { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";

function Feedback() {
  const { pending } = useLinkStatus();
  return <span className="navigation-feedback" data-pending={pending} aria-hidden="true" />;
}

export default function NavigationLink({ children, ...props }: ComponentProps<typeof Link>) {
  // Auto prefetch warms layouts/loading UI, without forcing full private-page prefetch.
  return <Link {...props} className={`responsive-link ${props.className || ""}`} prefetch={props.prefetch ?? null}>{children}<Feedback /></Link>;
}
