/**
 * Only the current GitHub Codespace's port 3000 is trusted, only by next dev.
 * Never derive trusted origins from incoming request headers.
 * @param {boolean} development
 * @param {Record<string, string | undefined>} env
 * @returns {string[]}
 */
export function codespacesOrigins(development, env = process.env) {
  if (!development || env.CODESPACES !== "true") return [];
  const name = env.CODESPACE_NAME;
  const domain =
    env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || "app.github.dev";
  if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 58) {
    throw new Error(
      "CODESPACE_NAME must be the current GitHub Codespace name.",
    );
  }
  if (domain !== "app.github.dev") {
    throw new Error(
      "Only the standard GitHub Codespaces forwarding domain is supported.",
    );
  }
  return [`${name}-3000.${domain}`];
}
