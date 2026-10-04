import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("tenant isolation, membership gates, privacy, lifecycle and audit", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,raw_user_meta_data jsonb); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema public,auth to authenticated; grant execute on function auth.uid() to authenticated;`,
    );
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202610040001_relay.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
    for (let n = 1; n <= 5; n++)
      await db.query("insert into auth.users values($1,$2)", [
        uid(n),
        {
          full_name: "User " + n,
          planned_department: "予定",
          position: "社員",
          role: "organization_admin",
        },
      ]);
    await db.exec(
      `insert into organizations(id,name) values('${uid(10)}','A'),('${uid(11)}','B'); insert into departments(id,organization_id,name) values('${uid(20)}','${uid(10)}','A1'),('${uid(21)}','${uid(10)}','A2'),('${uid(22)}','${uid(11)}','B1'); insert into memberships(user_id,organization_id,department_id,status) values('${uid(1)}','${uid(10)}','${uid(20)}','active'),('${uid(2)}','${uid(10)}','${uid(20)}','active'),('${uid(3)}','${uid(10)}','${uid(21)}','active'),('${uid(4)}','${uid(11)}','${uid(22)}','active');`,
    );
    await db.exec(
      `insert into important_notices(organization_id,department_id,author_id,body) values('${uid(10)}',null,'${uid(1)}','組織A'),('${uid(10)}','${uid(20)}','${uid(1)}','部署A1');`,
    );
    const actor = async (n) => {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        uid(n),
      ]);
      await db.exec("set role authenticated");
    };
    const count = async (table) =>
      (await db.query(`select * from ${table}`)).rows.length;
    const rpc = async (action, id) =>
      db.query("select post_action($1,$2)", [id, action]);
    await actor(1);
    const save = async (id = null, assignees = [uid(2)]) =>
      (
        await db.query(
          "select save_post($1,'補充','用紙を補充','request','normal',now()+interval '1 day',$2::uuid[]) id",
          [id, assignees],
        )
      ).rows[0].id;
    const post = await save();
    assert.equal(await count("important_notices"), 2);
    await assert.rejects(
      db.query(
        "select save_post(null,$1,'内容','notice','normal',now(),array[]::uuid[])",
        ["あ".repeat(31)],
      ),
      /check constraint/,
    );
    await assert.rejects(
      db.query(
        "select save_post(null,'タイトル','内容','notice','normal',null,array[]::uuid[])",
      ),
      /not-null/,
    );

    assert.equal(await count("posts"), 1);
    await assert.rejects(save(null, [uid(3)]), /同じ部署/);
    await assert.rejects(
      db.exec("update memberships set role='organization_admin'"),
      /permission denied/,
    );
    await actor(5);
    for (const table of [
      "organizations",
      "departments",
      "posts",
      "post_assignees",
      "supplements",
      "activity_logs",
      "important_notices",
    ])
      assert.equal(await count(table), 0, table + " pending access");
    assert.equal(
      (await db.query("select * from department_members()")).rows.length,
      0,
    );
    await assert.rejects(save(), /参加/);
    for (const n of [3, 4]) {
      await actor(n);
      assert.equal(await count("posts"), 0);
      assert.equal(
        (await db.query("select * from post_summaries()")).rows.length,
        0,
      );
      await assert.rejects(rpc("read", post), /権限/);
      await assert.rejects(rpc("complete", post), /権限/);
    }
    await actor(2);
    await rpc("read", post);
    assert.equal(await count("post_reads"), 0, "reader identities hidden");
    assert.equal(
      Number(
        (await db.query("select * from post_summaries()")).rows[0].read_count,
      ),
      1,
    );
    await assert.rejects(save(post), /編集/);
    await rpc("accept", post);
    await actor(1);
    await assert.rejects(save(post), /編集/);
    await rpc("pending", post);
    await assert.rejects(save(post), /編集/);
    await rpc("complete", post);
    assert.equal(
      (await db.query("select * from posts")).rows[0].status,
      "completed",
    );
    await db.query("select add_supplement($1,'17時に対応')", [post]);
    const sid = (await db.query("select id from supplements")).rows[0].id;
    await actor(2);
    await assert.rejects(
      db.query("select delete_supplement($1)", [sid]),
      /削除/,
    );
    await actor(1);
    await db.query("select delete_supplement($1)", [sid]);
    assert.equal(await count("supplements"), 0);
    assert.ok(
      (
        await db.query(
          "select * from activity_logs where action='deleted_supplement'",
        )
      ).rows.length,
    );
    await rpc("delete", post);
    assert.equal(await count("posts"), 0);
    await db.exec("reset role");
    const audit = (
      await db.query("select * from activity_logs where action='deleted_post'")
    ).rows[0];
    assert.equal(audit.actor_id, uid(1));
    assert.equal(audit.target_title, "補充");
  } finally {
    await db.close();
  }
});
