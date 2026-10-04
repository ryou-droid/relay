export default function Setup() {
  return (
    <main className="auth">
      <span className="brand">Relay</span>
      <h1>接続設定が必要です</h1>
      <p>
        Supabase のURLと公開キーを環境変数に設定し、README
        の手順でDBを初期化してください。
      </p>
      <p>設定後にアプリを再起動してください。</p>
    </main>
  );
}
