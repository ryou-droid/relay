import Link from "@/components/navigation-link";
export default function NotFound() {
  return (
    <main className="auth">
      <h1>投稿が見つかりません</h1>
      <p>削除されたか、閲覧権限がありません。</p>
      <Link href="/">ホームへ</Link>
    </main>
  );
}
