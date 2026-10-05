export function AdminMessage({ error, message }: { error?: string; message?: string }) {
  return <>{error && <p className="error" role="alert">{error}</p>}{message && <p className="notice" role="status">{message}</p>}</>;
}
