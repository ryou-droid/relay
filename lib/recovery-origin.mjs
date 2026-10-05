import { codespacesOrigins } from "../config/codespaces.mjs";

/** Use deployment configuration, never client-supplied Host/Origin headers. */
export function recoveryCallbackUrl(env = process.env) {
  const production = "https://relay-rouge-alpha.vercel.app";
  if (env.VERCEL_ENV === "production") return `${production}/auth/recovery`;
  if (env.VERCEL_ENV === "preview") {
    const host = env.VERCEL_URL;
    if (!host || !/^[a-z0-9-]+\.vercel\.app$/.test(host))
      throw new Error("Invalid preview deployment hostname");
    return `https://${host}/auth/recovery`;
  }
  if (env.NODE_ENV === "production") return `${production}/auth/recovery`;
  const [codespace] = codespacesOrigins(true, env);
  return codespace
    ? `https://${codespace}/auth/recovery`
    : "http://localhost:3000/auth/recovery";
}
