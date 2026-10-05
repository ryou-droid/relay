import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { registrationFailure } from "../lib/server/registration-log.mjs";

test("registration diagnostics retain Auth error fields but exclude credentials and personal input", () => {
  const password = "private-password-placeholder";
  const key = "test-api-key-placeholder";
  const report = registrationFailure({
    reference: "test-reference",
    stage: "auth.signUp",
    error: {
      name: "AuthApiError",
      code: "unexpected_failure",
      status: 500,
      message: "Database error saving new user",
    },
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
      VERCEL_ENV: "production",
    },
    metadataLengths: { full_name: 2, planned_department: 3, position: 2 },
    redactions: [password],
  });
  assert.equal(report.message, "Database error saving new user");
  assert.equal(report.code, "unexpected_failure");
  assert.equal(report.status, 500);
  assert.equal(report.supabase.host, "example.supabase.co");
  assert.equal(JSON.stringify(report).includes(key), false);
  const masked = registrationFailure({
    reference: "test-reference",
    stage: "auth.signUp",
    error: new Error(
      `Rejected test@example.com ${password} ${key} Bearer placeholder-token`,
    ),
    env: { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key },
    redactions: [password],
  });
  for (const secret of ["test@example.com", password, key, "placeholder-token"])
    assert.equal(JSON.stringify(masked).includes(secret), false);
  assert.equal(
    registrationFailure({
      reference: "x",
      stage: "environment",
      error: new Error("Missing configuration"),
      env: {},
    }).supabase.urlConfigured,
    false,
  );
});

test("Auth trigger works with restricted Auth role; invalid metadata rolls back the user without relaxing constraints", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon; create role authenticated; create role supabase_auth_admin; create schema auth; create table auth.users(id uuid primary key,raw_user_meta_data jsonb,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to supabase_auth_admin;grant insert,select on auth.users to supabase_auth_admin;`,
    );
    for (const file of [
      "202610040001_relay.sql",
      "202610040002_registration_diagnostics.sql",
      "202610050001_admin.sql",
      "202610050002_admin_read_only.sql", "202610050003_feed_performance.sql",
    ]) {
      await db.exec(
        await readFile(
          new URL("../supabase/migrations/" + file, import.meta.url),
          "utf8",
        ),
      );
    }
    // Run the same migration twice to ensure existing installations can safely reapply it.
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202610040002_registration_diagnostics.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec("set role supabase_auth_admin");
    const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    const good = {
      full_name: "田中",
      planned_department: "営業部署",
      position: "社員",
      role: "organization_admin",
    };
    await db.query("insert into auth.users(id,raw_user_meta_data) values($1,$2)", [id(1), good]);
    for (const [n, metadata, state] of [
      [2, { planned_department: "部署", position: "社員" }, "23502"],
      [3, { ...good, full_name: "" }, "23514"],
      [4, { ...good, planned_department: "あ".repeat(101) }, "23514"],
      [5, { ...good, position: null }, "23502"],
    ]) {
      await assert.rejects(
        db.query("insert into auth.users(id,raw_user_meta_data) values($1,$2)", [id(n), metadata]),
        (error) => error.code === state,
      );
      assert.equal(
        (await db.query("select * from auth.users where id=$1", [id(n)])).rows
          .length,
        0,
      );
    }
    await db.exec("reset role");
    const profile = (
      await db.query("select * from profiles where id=$1", [id(1)])
    ).rows[0];
    assert.equal(profile.full_name, good.full_name);
    assert.equal(profile.planned_department, good.planned_department);
    assert.equal(profile.position, good.position);
    assert.equal((await db.query("select * from memberships")).rows.length, 0);
    const revoked = (
      await db.query(
        "select has_function_privilege('authenticated','public.register_profile()','EXECUTE') allowed",
      )
    ).rows[0];
    assert.equal(revoked.allowed, false);
    // Validate the read-only catalog diagnostics against the migrated schema too.
    await db.exec(
      await readFile(
        new URL("../supabase/diagnostics/registration.sql", import.meta.url),
        "utf8",
      ),
    );
  } finally {
    await db.close();
  }
});
