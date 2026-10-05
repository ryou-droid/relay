import Link from "@/components/navigation-link";
import { homeFilters } from "@/lib/feed";
import RouteSkeleton from "@/components/route-skeleton";
export default function HomeSkeleton() {
  return <><div className="categories" aria-label="投稿カテゴリー">{homeFilters.map(([key, label]) => <Link key={key} href={`/app?category=${key}`} className={key === "new" ? "selected" : ""}>{label}</Link>)}</div><RouteSkeleton /></>;
}
