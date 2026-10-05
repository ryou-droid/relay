import { test } from "node:test";
import assert from "node:assert/strict";
import { recoveryCallbackUrl } from "../lib/recovery-origin.mjs";

test("recovery destinations use trusted deployment configuration", () => {
  assert.equal(recoveryCallbackUrl({ VERCEL_ENV: "production", VERCEL_URL: "evil.example" }), "https://relay-rouge-alpha.vercel.app/auth/recovery");
  assert.equal(recoveryCallbackUrl({ VERCEL_ENV: "preview", VERCEL_URL: "relay-test.vercel.app" }), "https://relay-test.vercel.app/auth/recovery");
  assert.equal(recoveryCallbackUrl({ NODE_ENV: "development" }), "http://localhost:3000/auth/recovery");
  assert.equal(recoveryCallbackUrl({ CODESPACES: "true", CODESPACE_NAME: "test-space" }), "https://test-space-3000.app.github.dev/auth/recovery");
  for (const host of ["evil.example", "relay.vercel.app@evil.example", "relay.vercel.app/path", "https://relay.vercel.app", undefined])
    assert.throws(() => recoveryCallbackUrl({ VERCEL_ENV: "preview", VERCEL_URL: host }));
});
