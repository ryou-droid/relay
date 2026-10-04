import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import { codespacesOrigins } from "./config/codespaces.mjs";

export default function config(phase: string): NextConfig {
  const origins = codespacesOrigins(phase === PHASE_DEVELOPMENT_SERVER);
  return {
    ...(origins.length
      ? {
          allowedDevOrigins: origins,
        }
      : {}),
    experimental: {
      // Use the TypeScript 5.9 compiler API; keep full build-time type checking.
      // Avoid child-CLI output parsing failures in restricted build environments.
      useTypeScriptCli: false,
      ...(origins.length ? { serverActions: { allowedOrigins: origins } } : {}),
    },
    async headers() {
      return [
        {
          source: "/:path*",
          headers: [
            { key: "X-Content-Type-Options", value: "nosniff" },
            { key: "X-Frame-Options", value: "DENY" },
            {
              key: "Referrer-Policy",
              value: "strict-origin-when-cross-origin",
            },
            {
              key: "Permissions-Policy",
              value: "camera=(), microphone=(), geolocation=()",
            },
          ],
        },
      ];
    },
  };
}
