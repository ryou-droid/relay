import { test } from "node:test";
import assert from "node:assert/strict";
import { codespacesOrigins } from "../config/codespaces.mjs";
import csrf from "next/dist/server/app-render/csrf-protection.js";
const environment = { CODESPACES: "true", CODESPACE_NAME: "relay-test-abc123" };

test("trust only the current Codespace port 3000; keep production unchanged", () => {
  const origins = codespacesOrigins(true, environment);
  assert.deepEqual(origins, ["relay-test-abc123-3000.app.github.dev"]);
  assert.equal(csrf.isCsrfOriginAllowed(origins[0], origins), true);
  for (const host of [
    "other-3000.app.github.dev",
    "relay-test-abc123-4000.app.github.dev",
    "relay-test-abc123-3000.app.github.dev.evil.example",
    "evil.example",
  ]) {
    assert.equal(csrf.isCsrfOriginAllowed(host, origins), false);
  }
  assert.deepEqual(codespacesOrigins(false, environment), []);
  assert.deepEqual(codespacesOrigins(true, {}), []);
  assert.deepEqual(
    codespacesOrigins(true, { ...environment, CODESPACES: "false" }),
    [],
  );
});

test("reject malformed or wildcard configuration", () => {
  for (const name of ["*", "../other", "https://relay", "relay.example", ""]) {
    assert.throws(() =>
      codespacesOrigins(true, { ...environment, CODESPACE_NAME: name }),
    );
  }
  assert.throws(() =>
    codespacesOrigins(true, {
      ...environment,
      GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: "*.app.github.dev",
    }),
  );
});
