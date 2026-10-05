/**
 * Select diagnostics only: never log a response, row, Cookie, header or session.
 * @param {{ reference: string, operation: string, error: unknown, redactions?: string[] }} input
 */
export function adminFailure({ reference, operation, error, redactions = [] }) {
  const value = error && typeof error === "object" ? error : {};
  const sanitize = (input) => {
    if (typeof input !== "string") return null;
    let text = input;
    for (const secret of redactions.filter(Boolean).sort((a, b) => b.length - a.length))
      text = text.split(secret).join("[REDACTED]");
    return text
      .replace(/Failing row contains[\s\S]*/gi, "[REDACTED_ROW]")
      .replace(/\bKey\s*\([^)]*\)\s*=\s*\([^)]*\)/gi, "[REDACTED_KEY_VALUE]")
      .replace(/\$([a-z_][a-z0-9_]*)?\$[\s\S]*?\$\1\$/gi, "[REDACTED_SQL_LITERAL]")
      .replace(/'(?:''|[^'])*'/g, "[REDACTED_LITERAL]")
      .replace(/"(?:""|[^"])*"/g, "[REDACTED_QUOTED_VALUE]")
      .replace(/https?:\/\/[^\s<>]+/gi, "[REDACTED_URL]")
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]")
      .replace(/\b(?:sb_secret_|sb_publishable_|ghp_|github_pat_)[A-Za-z0-9_-]+/g, "[REDACTED_KEY]")
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED_TOKEN]")
      .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
      .replace(/\b(?:access_token|refresh_token|token|code|password|secret|key)\s*[:=]\s*[^\s,;]+/gi, "[REDACTED_CREDENTIAL]")
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[REDACTED_ID]")
      .replace(/\b[A-Za-z0-9_+/=-]{32,}\b/g, "[REDACTED_OPAQUE_VALUE]")
      .slice(0, 2048);
  };
  return {
    event: "relay.admin.failed", reference, operation,
    code: typeof value.code === "string" && /^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(value.code) ? value.code : null,
    message: sanitize(value.message), details: sanitize(value.details), hint: sanitize(value.hint),
  };
}
