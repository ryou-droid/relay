import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { requireAdminSession, isAdminRole } from '../lib/admin-access.mjs';
import ts from 'typescript';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

test('server admin gate redirects users on direct admin URLs; organization-only pages reject department admins', async () => {
  const redirect = (url) => { throw new Error(`REDIRECT:${url}`); };
  await assert.rejects(requireAdminSession(async () => ({ membership: { role: 'user' } }), redirect), /REDIRECT:\/app/);
  for (const role of ['department_admin','organization_admin']) {
    const context = { membership: { role } };
    assert.equal(await requireAdminSession(async () => context, redirect), context);
  }
  await assert.rejects(requireAdminSession(async () => ({ membership: { role: 'department_admin' } }), redirect, true), /REDIRECT:\/app/);
  assert.equal(isAdminRole('user'), false);
  assert.equal(isAdminRole('forged_admin'), false);
  await assert.rejects(requireAdminSession(async () => { redirect('/suspended'); }, redirect), /REDIRECT:\/suspended/);
});

test('rendering every actual admin page as a regular user redirects before any management data is fetched', async () => {
  const redirect = (url) => { throw new Error(`REDIRECT:${url}`); };
  for (const page of ['layout.tsx','page.tsx','approvals/page.tsx','approvals/[id]/page.tsx','users/page.tsx','departments/page.tsx','notices/page.tsx']) {
    const source = await readFile(new URL(`../app/admin/${page}`,import.meta.url),'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    }}).outputText;
    const exports = {};
    let gateCalls = 0;
    const guard = async (organizationOnly=false) => {
      gateCalls++;
      return requireAdminSession(async () => ({membership:{role:'user'}, db: new Proxy({}, {get:()=>{throw new Error('Private data accessed');}})}),redirect,organizationOnly);
    };
    vm.runInNewContext(compiled, {exports, require: (name) => {
      if(name==='@/lib/admin') return {adminSession:guard,adminDepartments:()=>guard()};
      if(name==='next/navigation') return {redirect,notFound:()=>{throw new Error('Unexpected notFound');}};
      // These imports must not execute because the page must redirect before rendering.
      return new Proxy({}, { get:()=>()=>{throw new Error(`Unexpected render import: ${name}`);} });
    }});
    await assert.rejects(exports.default({params:Promise.resolve({id:uid(8)}),searchParams:Promise.resolve({}),children:null}),/REDIRECT:\/app/,page);
    assert.equal(gateCalls,1,page);
  }
});

test('actual server actions reject regular users before RPC execution', async () => {
  const source = await readFile(new URL('../app/admin/actions.ts',import.meta.url),'utf8');
  const compiled = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2017}}).outputText;
  const redirect = (url) => {throw new Error(`REDIRECT:${url}`);};
  const exports = {};
  vm.runInNewContext(compiled,{exports,console,require:(name)=>{
    if(name==='@/lib/admin') return {adminSession:(only)=>requireAdminSession(async()=>({membership:{role:'user'}}),redirect,only)};
    if(name==='next/navigation')return {redirect};
    if(name==='next/cache')return {revalidatePath:()=>{throw new Error('Unexpected write');}};
    throw new Error('Unexpected import');
  }});
  for(const name of ['approveUser','saveDepartment','manageUser','createInvitation','revokeInvitation','saveNotice','disableNotice']) {
    await assert.rejects(exports[name](new FormData()),/REDIRECT:\/app/,name);
  }
});

test('normal user header never includes management entry; both administrator roles do', async () => {
  const source = await readFile(new URL('../app/app/layout.tsx',import.meta.url),'utf8');
  const compiled = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2017,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  for(const role of ['user','department_admin','organization_admin','forged_admin']) {
    const exports={};
    vm.runInNewContext(compiled,{exports,require:(name)=>{
      if(name==='@/lib/session')return {session:async()=>({membership:{role,departments:{name:'営業'}}})};
      if(name==='@/lib/admin-access.mjs')return {isAdminRole};
      if(name==='react/jsx-runtime')return require(name);
      return {__esModule:true,default:()=>null};
    }});
    const tree=await exports.default({children:null});
    const links=[];
    function visit(element){
      if(Array.isArray(element)){element.forEach(visit);return;}
      if(!element?.props)return;
      if(element.props.href)links.push(element.props.href);
      visit(element.props.children);
    }
    visit(tree);
    assert.equal(links.includes('/admin'),isAdminRole(role),role);
  }
});

test('real SQL: organization/dept scopes, invitation-bound approval, suspension, departments, roles and notices', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to authenticated;grant execute on function auth.uid() to authenticated;`);
    for (const migration of ['202610040001_relay.sql','202610040002_registration_diagnostics.sql','202610050001_admin.sql','202610050002_admin_read_only.sql']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`,import.meta.url),'utf8'));
    }
    const addUser = async (n, invitation, confirmed=true) => db.query('insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,$3,$4)',[
      uid(n),`user${n}@example.com`,confirmed ? new Date().toISOString() : null,
      {full_name:`User ${n}`,planned_department:'営業',position:'社員',role:'organization_admin', ...(invitation ? {invitation_code:invitation}: {})},
    ]);
    for (const n of [1,2,3,4,5,10,12]) await addUser(n);
    await db.exec(`insert into organizations(id,name) values('${uid(100)}','A'),('${uid(101)}','B');
      insert into departments(id,organization_id,name) values('${uid(20)}','${uid(100)}','営業'),('${uid(21)}','${uid(100)}','経理'),('${uid(22)}','${uid(101)}','営業');
      insert into memberships(user_id,organization_id,department_id,role,status) values
      ('${uid(1)}','${uid(100)}','${uid(20)}','organization_admin','active'),
      ('${uid(2)}','${uid(100)}','${uid(20)}','department_admin','active'),
      ('${uid(3)}','${uid(100)}','${uid(20)}','user','active'),
      ('${uid(4)}','${uid(100)}','${uid(21)}','user','active'),
      ('${uid(12)}','${uid(100)}','${uid(21)}','organization_admin','active'),
      ('${uid(5)}','${uid(101)}','${uid(22)}','organization_admin','active');`);
    const actor = async (n) => {
      await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid(n)]);await db.exec('set role authenticated');
    };
    const rows = async (sql,params=[]) => (await db.query(sql,params)).rows;
    const invite = async (department=null) => (await rows('select create_invitation($1) id',[department]))[0].id;
    await actor(1);
    const ia=await invite(),iad=await invite(uid(20)),iae=await invite(uid(21));
    await actor(5);const ib=await invite();
    await actor(2);
    await invite(uid(20));
    await assert.rejects(invite(),/管理権限/);await assert.rejects(invite(uid(21)),/管理権限/);
    await assert.rejects(db.query('select save_department(null,$1,true)',['新部署']),/組織管理者/);
    const departments = await rows('select id from departments');assert.deepEqual(departments.map(x=>x.id),[uid(20)]);
    await db.exec('reset role');
    await addUser(6,ia);await addUser(7,ib);await addUser(8,iad);await addUser(9,iae);await addUser(11,ia,false);
    await assert.rejects(addUser(15,uid(999)),/招待コード/);
    assert.equal((await rows('select id from auth.users where id=$1',[uid(15)])).length,0,'failed invitation rolls back Auth + profile');
    const requestId=async (n)=>(await rows('select id from join_requests where user_id=$1',[uid(n)]))[0].id;
    const r6=await requestId(6),r7=await requestId(7),r8=await requestId(8),r9=await requestId(9),r11=await requestId(11);
    const mid=async (n)=>(await rows("select id from memberships where user_id=$1 and status='active'",[uid(n)]))[0].id;
    const m1=await mid(1),m3=await mid(3),m4=await mid(4),m5=await mid(5);
    await actor(3);
    for (const table of ['join_requests','organization_invitations','admin_activity_logs']) assert.equal((await rows(`select * from ${table}`)).length,0,table);
    assert.equal((await rows('select * from profiles')).length,1);
    for(const sql of ['select admin_approvals()','select admin_users()','select admin_notices()',`select create_invitation('${uid(20)}')`,`select approve_user('${r8}','${uid(20)}')`,`select save_department(null,'不正',true)`,`select save_notice('${uid(20)}','不正')`,`select manage_user('${m4}','user',true,'${uid(21)}')`]) await assert.rejects(db.exec(sql),/管理権限/);
    await assert.rejects(db.exec("update profiles set suspended=false"),/permission denied/);
    await assert.rejects(db.exec("insert into departments(organization_id,name) values('"+uid(100)+"','不正')"),/permission denied/);
    await assert.rejects(db.exec('select require_admin()'),/permission denied/);
    await assert.rejects(db.query('select enqueue_join_request($1,$2)',[uid(10),ia]),/permission denied/);
    await actor(10);
    for(const table of ['organizations','departments','posts','important_notices']) assert.equal((await rows(`select * from ${table}`)).length,0);
    await db.query('select request_membership($1)',[ia]);
    await assert.rejects(db.query('select request_membership($1)',[ib]),/申請済み/);
    await actor(2);
    assert.deepEqual((await rows('select user_id from admin_approvals()')).map(x=>x.user_id),[uid(8)]);
    await assert.rejects(db.query('select approve_user($1,$2)',[r6,uid(20)]),/承認できません/);
    await assert.rejects(db.query('select approve_user($1,$2)',[r9,uid(21)]),/承認できません/);
    await assert.rejects(db.query('select approve_user($1,$2)',[r8,uid(21)]),/承認できません/);
    await db.query('select approve_user($1,$2)',[r8,uid(20)]);
    assert.equal((await rows('select role from memberships where user_id=$1',[uid(8)]))[0].role,'user','signup metadata never grants admin role');
    await assert.rejects(db.query('select approve_user($1,$2)',[r8,uid(20)]),/承認できません/);
    await assert.rejects(db.query('select manage_user($1,$2,true,$3)',[m3,'organization_admin',uid(20)]),/部署管理者/);
    await assert.rejects(db.query('select manage_user($1,$2,true,$3)',[m1,'organization_admin',uid(20)]),/部署管理者/);
    await assert.rejects(db.query('select manage_user($1,$2,true,$3)',[m4,'user',uid(21)]),/変更できません/);
    await actor(1);
    assert.equal((await rows('select * from admin_approvals()')).some(x=>x.user_id===uid(7)),false);
    await assert.rejects(db.query('select approve_user($1,$2)',[r7,uid(20)]),/承認できません/);
    await assert.rejects(db.query('select approve_user($1,$2)',[r6,uid(22)]),/承認できません|有効な部署/);
    await assert.rejects(db.query('select approve_user($1,$2)',[r11,uid(20)]),/メール確認/);
    await assert.rejects(db.query('select approve_user($1,$2)',[r6,null]),/承認できません|有効な部署/);
    await db.query('select approve_user($1,$2)',[r6,uid(21)]);
    const newDept=(await rows("select save_department(null,' 開発 ',true) id"))[0].id;
    await db.query("select save_department($1,'開発部',true)",[newDept]);
    await assert.rejects(db.query("select save_department(null,'開発部',true)"),/unique constraint/);
    await assert.rejects(db.query("select save_department($1,'営業',false)",[uid(20)]),/所属ユーザー/);
    await db.query("select save_department($1,'開発部',false)",[newDept]);
    await assert.rejects(db.query('select approve_user($1,$2)',[r11,newDept]),/メール確認|有効な部署/);
    await assert.rejects(db.query('select manage_user($1,$2,true,$3)',[m5,'user',uid(20)]),/変更できません/);
    await assert.rejects(db.query('select manage_user($1,$2,true,$3)',[m1,'user',uid(20)]),/変更できません/);
    await db.query('select manage_user($1,$2,false,$3)',[m4,'department_admin',uid(21)]);
    await actor(4);assert.equal((await rows('select * from admin_users()')).every(x=>x.department_id===uid(21)),true);
    await actor(3);
    const post=(await rows("select save_post(null,'確認','内容','notice','normal',now(),array[]::uuid[]) id"))[0].id;
    await actor(2);await db.query('select manage_user($1,$2,true,$3)',[m3,'user',uid(20)]);
    await actor(3);
    assert.equal((await rows('select * from posts')).length,0,'suspended session sees no posts');
    assert.equal((await rows('select * from organizations')).length,0);
    assert.equal((await rows('select * from department_members()')).length,0);
    await assert.rejects(db.exec("select save_post(null,'禁止','内容','notice','normal',now(),array[]::uuid[])"),/参加/);
    await assert.rejects(db.query('select post_action($1,$2)',[post,'complete']),/権限/);
    await assert.rejects(db.query('select request_membership($1)',[ia]),/参加申請/);
    await actor(2);assert.equal((await rows('select * from department_members()')).some(x=>x.user_id===uid(3)),false);
    await db.query('select manage_user($1,$2,false,$3)',[m3,'user',uid(20)]);
    const notice=(await rows('select save_notice($1,$2) id',[uid(20),'部署連絡']))[0].id;
    await assert.rejects(db.query('select save_notice(null,$1)',['組織連絡']),/管理権限/);
    await assert.rejects(db.query('select save_notice($1,$2)',[uid(21),'他部署']),/管理権限/);
    await actor(1);await db.query('select save_notice(null,$1)',['組織連絡']);
    await db.query('select save_notice($1,$2)',[uid(21),'経理連絡']);
    await actor(2);assert.equal((await rows('select * from admin_notices()')).length,1);
    await actor(5);assert.equal((await rows('select * from admin_notices()')).length,0);
    await assert.rejects(db.query('select disable_notice($1)',[notice]),/管理権限/);
    await actor(1);await db.query('select disable_notice($1)',[notice]);
    assert.ok((await rows('select * from admin_activity_logs')).length>0);
    await actor(5);assert.ok((await rows('select * from admin_activity_logs')).every(x=>x.organization_id===uid(101)));
    await assert.rejects(db.query('select revoke_invitation($1)',[ia]),/管理権限/);
    await actor(1);await db.query('select revoke_invitation($1)',[ia]);
    await db.exec('reset role');await assert.rejects(addUser(16,ia),/招待コード/);
    await db.exec('set role anon');
    await assert.rejects(db.exec('select admin_users()'),/permission denied/);
    await assert.rejects(db.exec('select * from join_requests'),/permission denied/);
  } finally { await db.close(); }
});
