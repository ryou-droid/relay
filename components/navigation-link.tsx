"use client";
import Link, { useLinkStatus } from "next/link";
import type { ComponentProps, ReactNode } from "react";

function Feedback({ children }: { children: ReactNode }) {
  const { pending } = useLinkStatus();
  return <span className="navigation-content" data-pending={pending} aria-busy={pending}>
    {children}<span className="navigation-progress" aria-hidden="true" />
  </span>;
}

export default function NavigationLink({ children, ...props }: ComponentProps<typeof Link>) {
  // Auto prefetch warms layouts/loading UI, without forcing full private-page prefetch.
  return <Link {...props} prefetch={null}><Feedback>{children}</Feedback></Link>;
}
