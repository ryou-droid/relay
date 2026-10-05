import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
export const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export async function feedDatabase() {
 const db = new PGlite();
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated;grant execute on function auth.uid() to authenticated;`);
 for(const file of ['202610040001_relay.sql','202610040002_registration_diagnostics.sql','202610050001_admin.sql','202610050002_admin_read_only.sql','202610050003_feed_performance.sql']) await db.exec(await readFile(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'));
 for(const n of [1,2,3,4,5]) await db.query('insert into auth.users values($1,$2,now(),$3)',[id(n),`fixture${n}@example.test`,{full_name:'テスト',planned_department:'部署',position:'社員'}]);
 await db.exec(`insert into organizations(id,name)values('${id(10)}','A'),('${id(11)}','B');insert into departments(id,organization_id,name)values('${id(20)}','${id(10)}','A1'),('${id(21)}','${id(10)}','A2'),('${id(22)}','${id(11)}','B1');insert into memberships(user_id,organization_id,department_id,role,status)values('${id(1)}','${id(10)}','${id(20)}','organization_admin','active'),('${id(2)}','${id(10)}','${id(20)}','user','active'),('${id(3)}','${id(10)}','${id(21)}','department_admin','active'),('${id(4)}','${id(11)}','${id(22)}','organization_admin','active');
 insert into posts(id,organization_id,department_id,author_id,kind,title,body,priority,status,due_at,created_at,completed_at)
 select md5(i::text)::uuid,'${id(10)}','${id(20)}','${id(2)}','request','投稿','本文','high',case when i<=100 then 'pending'::post_status else 'completed'::post_status end,now()-interval '1 hour',now()-(i/2)*interval '1 minute',case when i>100 then now() else null end from generate_series(1,1200)i;
 insert into posts(id,organization_id,department_id,author_id,kind,title,body,due_at)values('${id(10000)}','${id(11)}','${id(22)}','${id(4)}','notice','他組織','秘密',now()),('${id(10001)}','${id(10)}','${id(21)}','${id(3)}','notice','他部署','秘密',now());
 insert into post_reads(post_id,user_id,confirmed_at) select id,'${id(1)}',now() from posts where department_id='${id(20)}' and status='completed';`);
 return db;
}
export async function actor(db, n) {
 await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n ? id(n) : '']);await db.exec('set role authenticated');
}
