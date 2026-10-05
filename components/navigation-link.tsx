"use client";
import Link, { useLinkStatus } from "next/link";
import { useRef, type ComponentProps } from "react";
import { beginNavigationFeedback } from "@/lib/navigation-feedback";

function Feedback() {
  const { pending } = useLinkStatus();
  return <span className="navigation-feedback" data-pending={pending} aria-hidden="true" />;
}

export default function NavigationLink({ children, ...props }: Omit<ComponentProps<typeof Link>, "ref">) {
  const link = useRef<HTMLAnchorElement>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const release = () => { pointer.current = null; link.current?.removeAttribute("data-pressed"); };
  return <Link {...props} ref={link} className={`responsive-link ${props.className || ""}`} prefetch={props.prefetch ?? null}
    onPointerDown={event => {
      props.onPointerDown?.(event);
      if (event.defaultPrevented || event.button !== 0) return;
      pointer.current = { x: event.clientX, y: event.clientY };
      event.currentTarget.setAttribute("data-pressed", "true");
    }}
    onPointerMove={event => {
      props.onPointerMove?.(event);
      if (pointer.current && Math.hypot(event.clientX - pointer.current.x, event.clientY - pointer.current.y) > 10) release();
    }}
    onPointerUp={event => { props.onPointerUp?.(event); release(); }}
    onPointerCancel={event => { props.onPointerCancel?.(event); release(); }}
    onPointerLeave={event => { props.onPointerLeave?.(event); release(); }}
    onBlur={event => { props.onBlur?.(event); release(); }}
    onNavigate={event => {
      let prevented = false;
      props.onNavigate?.({ preventDefault: () => { prevented = true; event.preventDefault(); } });
      if (!prevented) beginNavigationFeedback(link.current);
    }}
  >{children}<Feedback /></Link>;
}
