/**
 * Explicitly select diagnostic fields: never log Auth responses, FormData,
 * cookies, request headers, passwords or environment variable values.
 * @param {{reference: string, stage: string, error: unknown, redactions?: string[], env?: Record<string, string | undefined>, metadataLengths?: Record<string, number>}} input
 */
export function registrationFailure({
  reference,
  stage,
  error,
  redactions = [],
  env = process.env,
  metadataLengths = {},
}) {
  const value = error && typeof error === "object" ? error : {};
  const property = (key) => Reflect.get(value, key);
  const raw =
    typeof property("message") === "string"
      ? property("message")
      : "Unknown registration error";
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  let host = null;
  try {
    host = url ? new URL(url).hostname : null;
  } catch {
    /* Log validity only. */
  }
  let message = raw;
  for (const secret of [...redactions, key || ""]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)) {
    message = message.split(secret).join("[REDACTED]");
  }
  message = message
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]")
    .replace(
      /\b(?:sb_secret_|sb_publishable_|ghp_|github_pat_)[A-Za-z0-9_-]+/g,
      "[REDACTED_KEY]",
    )
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      "[REDACTED_TOKEN]",
    )
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [REDACTED]");
  const code = property("code");
  const status = property("status");
  const name = property("name");
  return {
    event: "relay.registration.failed",
    reference,
    stage,
    message: message.slice(0, 4096),
    code:
      typeof code === "string" && /^[a-zA-Z0-9_.-]{1,80}$/.test(code)
        ? code
        : null,
    status:
      typeof status === "number" && Number.isFinite(status) ? status : null,
    errorName:
      typeof name === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(name)
        ? name
        : null,
    environment: env.VERCEL_ENV || env.NODE_ENV || "unknown",
    supabase: {
      urlConfigured: Boolean(url?.trim()),
      keyConfigured: Boolean(key?.trim()),
      urlValid: Boolean(host),
      host,
      keyKind: key?.startsWith("sb_publishable_")
        ? "publishable"
        : key?.startsWith("eyJ")
          ? "legacy-jwt"
          : key
            ? "other"
            : "missing",
    },
    metadataLengths,
  };
}
