import { test } from "node:test";
import assert from "node:assert/strict";
import {
  passwordProblem,
  missingRecoveryAccount,
  logRecoveryError,
} from "../lib/password-recovery.mjs";
test("reject short or mismatched passwords; preserve whitespace and Unicode", () => {
  assert.ok(passwordProblem("1234567", "1234567"));
  assert.ok(passwordProblem("12345678", "87654321"));
  assert.ok(passwordProblem("😀😀😀😀", "😀😀😀😀"));
  assert.equal(passwordProblem("correct password ", "correct password "), null);
  assert.equal(passwordProblem("あいうえおかきく", "あいうえおかきく"), null);
});
test("unknown-account errors use the generic sent response; operational errors stay distinguishable", () => {
  assert.equal(missingRecoveryAccount({ code: "user_not_found" }), true);
  assert.equal(missingRecoveryAccount({ code: "email_not_found" }), true);
  assert.equal(
    missingRecoveryAccount({ code: "over_email_send_rate_limit" }),
    false,
  );
  assert.equal(missingRecoveryAccount(new Error("network failure")), false);
});
test("recovery diagnostics never serialize credentials, tokens or full errors", () => {
  const messages = [];
  const original = console.error;
  try {
    console.error = (...args) => messages.push(args.join(" "));
    logRecoveryError("update_password", {
      code: "weak_password",
      status: 422,
      message: "private-user@example.com private-password private-token",
      session: { access_token: "private-token" },
    });
  } finally {
    console.error = original;
  }
  assert.ok(messages[0].includes("weak_password"));
  assert.ok(messages[0].includes("422"));
  for (const secret of [
    "private-user@example.com",
    "private-password",
    "private-token",
  ])
    assert.ok(!messages[0].includes(secret));
});

for (const mode of ["code", "token_hash"]) test(`Supabase SSR ${mode} recovery persists session, updates password and signs out`, async () => {
  const { createServerClient } = await import("@supabase/ssr");
  const jar = new Map();
  const requests = [];
  const uid = "00000000-0000-4000-8000-000000000001";
  const now = Math.floor(Date.now() / 1000);
  const jwt = [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(
      JSON.stringify({
        sub: uid,
        aud: "authenticated",
        exp: now + 3600,
        iat: now,
      }),
    ).toString("base64url"),
    Buffer.from("mock-signature").toString("base64url"),
  ].join(".");
  const user = {
    id: uid,
    aud: "authenticated",
    role: "authenticated",
    email: "test@example.com",
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  let used = false;
  const mockFetch = async (input, init) => {
    // Model asynchronous HTTP delivery, allowing Auth initialization to complete.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const path = new URL(typeof input === "string" ? input : input.url)
      .pathname;
    const body = init?.body ? JSON.parse(init.body) : null;
    requests.push({ url: String(input), path, method: init?.method || "GET", body });
    const response = (value, status = 200) =>
      new Response(JSON.stringify(value), {
        status,
        headers: {
          "Content-Type": "application/json",
          "x-supabase-api-version": "2024-01-01",
        },
      });
    if (path === "/auth/v1/recover")
      return body.email === "missing@example.com"
        ? response({ message: "User not found", code: "user_not_found" }, 400)
        : response({});
    if (path === "/auth/v1/verify" || path === "/auth/v1/token") {
      if (
        used ||
        (mode === "code"
          ? body.auth_code !== "mock-recovery-code" || !body.code_verifier
          : body.token_hash !== "mock-recovery-token" || body.type !== "recovery")
      )
        return response({ message: "Invalid OTP", code: "otp_expired" }, 400);
      used = true;
      return response({
        access_token: jwt,
        refresh_token: "mock-refresh-token",
        token_type: "bearer",
        expires_in: 3600,
        user,
      });
    }
    if (path === "/auth/v1/user") {
      const authorization = new Headers(init?.headers).get("authorization");
      assert.equal(authorization, `Bearer ${jwt}`);
      return response(user);
    }
    if (path === "/auth/v1/logout") return new Response(null, { status: 204 });
    throw new Error("Unexpected mock Auth endpoint");
  };
  const client = () =>
    createServerClient(
      "https://mock.supabase.co",
      "test-public-key-placeholder",
      {
        global: { fetch: mockFetch },
        cookies: {
          getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
          setAll: (values) =>
            values.forEach(({ name, value, options }) => {
              if (options?.maxAge === 0) jar.delete(name);
              else jar.set(name, value);
            }),
        },
      },
    );
  const request = client();
  assert.equal(
    (await request.auth.resetPasswordForEmail("test@example.com", { redirectTo: "https://relay-rouge-alpha.vercel.app/auth/recovery" })).error,
    null,
  );
  const recover = requests.find((r) => r.path === "/auth/v1/recover");
  assert.ok(recover.body.code_challenge);
  assert.equal(new URL(recover.url).searchParams.get("redirect_to"), "https://relay-rouge-alpha.vercel.app/auth/recovery");
  if (mode === "code") {
    const saved = new Map(jar);
    jar.clear();
    assert.ok((await client().auth.exchangeCodeForSession("mock-recovery-code")).error);
    for (const [name, value] of saved) jar.set(name, value);
    const result = await client().auth.exchangeCodeForSession("mock-recovery-code");
    assert.equal(result.error, null);
    assert.equal(result.data.redirectType, "recovery");
  } else {
    assert.equal((await client().auth.verifyOtp({ token_hash: "mock-recovery-token", type: "recovery" })).error, null);
  }
  assert.ok(
    Array.from(jar.keys()).some(
      (name) => name.includes("auth-token") && !name.includes("code-verifier"),
    ),
  );
  const reset = client();
  assert.equal((await reset.auth.getUser()).data.user.id, uid);
  assert.equal(
    (await reset.auth.updateUser({ password: "new-test-password" })).error,
    null,
  );
  assert.equal(
    requests.find((r) => r.method === "PUT").body.password,
    "new-test-password",
  );
  assert.equal((await reset.auth.signOut({ scope: "global" })).error, null);
  assert.ok(
    !Array.from(jar.keys()).some((name) =>
      /^sb-mock-auth-token(?:\.\d+)?$/.test(name),
    ),
  );
  assert.equal((await client().auth.getUser()).data.user, null);
  assert.ok(
    (
      await client().auth.verifyOtp({
        token_hash: "mock-recovery-token",
        type: "recovery",
      })
    ).error,
  );
});
