import HomeSkeleton from "@/components/home-skeleton";
import Nav from "@/components/nav";
export default function Loading() {
  return <div className="shell"><header className="header"><span className="brand">Relay</span><span className="department" aria-label="所属部署を確認中">部署を確認中</span></header><main className="content"><div className="page-heading"><h1>今日の引き継ぎ</h1></div><HomeSkeleton /></main><Nav /></div>;
}
