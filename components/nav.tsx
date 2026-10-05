"use client";
import Link from "@/components/navigation-link";
import { usePathname } from "next/navigation";
const links = [
  ["/app", "⌂", "ホーム"],
  ["/app/posts/new", "＋", "投稿"],
  ["/app/history", "◷", "履歴"],
  ["/app/me", "○", "マイページ"],
];
export default function Nav() {
  const path = usePathname();
  return (
    <nav className="bottom-nav" aria-label="メインナビゲーション">
      {links.map(([href, icon, label]) => (
        <Link
          key={href}
          href={href}
          aria-current={path === href ? "page" : undefined}
          className={path === href ? "selected" : ""}
        >
          <span aria-hidden>{icon}</span>
          {label}
        </Link>
      ))}
    </nav>
  );
}
