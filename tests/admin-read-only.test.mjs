import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {adminFailure} from '../lib/server/admin-log.mjs';
import ts from 'typescript';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const id=(n)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

test('reproduce PostgREST read-only failure, repair it without weakening scopes or mutation locks',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated;grant execute on function auth.uid() to authenticated;`);
  for(const file of ['202610040001_relay.sql','202610040002_registration_diagnostics.sql','202610050001_admin.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  for(const n of [1,2,3,4])await db.query('insert into auth.users values($1,$2,now(),$3)',[id(n),`test${n}@example.com`,{full_name:'テスト',planned_department:'部署',position:'社員'}]);
  await db.exec(`insert into organizations(id,name) values('${id(10)}','A'),('${id(11)}','B');insert into departments(id,organization_id,name) values('${id(20)}','${id(10)}','A1'),('${id(21)}','${id(11)}','B1');insert into memberships(user_id,organization_id,department_id,role,status)values('${id(1)}','${id(10)}','${id(20)}','organization_admin','active'),('${id(2)}','${id(10)}','${id(20)}','department_admin','active'),('${id(3)}','${id(10)}','${id(20)}','user','active'),('${id(4)}','${id(11)}','${id(21)}','organization_admin','active');`);
  const actor=async(n)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n? id(n):'']);await db.exec('set role authenticated');};
  const readOnly=async(name)=>{await db.exec('begin read only');try{return (await db.query(`select * from ${name}()`)).rows;}finally{await db.exec('rollback');}};
  await actor(1);
  assert.equal((await db.query('select is_member($1,$2) value',[id(10),id(20)])).rows[0].value,true);
  assert.equal((await db.query('select admin_scope($1,null) value',[id(10)])).rows[0].value,true);
  for(const name of ['admin_approvals','admin_users','admin_notices'])await assert.rejects(readOnly(name),(e)=>e.code==='25006'&&e.message.includes('SELECT FOR SHARE'));
  await db.exec('reset role');
  const migration=await readFile(new URL('../supabase/migrations/202610050002_admin_read_only.sql',import.meta.url),'utf8');
  await db.exec(migration);await db.exec(migration); // Repair is safely re-applicable.
  const lock=(await db.query("select pg_get_functiondef('public.require_admin()'::regprocedure) definition")).rows[0].definition;
  assert.match(lock,/for share/);
  assert.equal((await db.query("select has_function_privilege('authenticated','public.check_admin_read()','EXECUTE') allowed")).rows[0].allowed,false);
  assert.equal((await db.query("select has_function_privilege('anon','public.admin_approvals()','EXECUTE') allowed")).rows[0].allowed,false);
  for(const n of [1,2,4]){
   await actor(n);
   assert.deepEqual(await readOnly('admin_approvals'),[]);
   const users=await readOnly('admin_users');
   assert.equal(users.every((u)=>n===4? u.department_id===id(21):u.department_id===id(20)),true);
   assert.deepEqual(await readOnly('admin_notices'),[]);
  }
  for(const n of [3,null]){await actor(n);for(const name of ['admin_approvals','admin_users','admin_notices'])await assert.rejects(readOnly(name),/管理権限/);}
  await db.exec('reset role');await db.query('update profiles set suspended=true where id=$1',[id(1)]);
  await actor(1);await assert.rejects(readOnly('admin_approvals'),/管理権限/);
  await db.exec('reset role');
  await db.exec(await readFile(new URL('../supabase/diagnostics/admin.sql',import.meta.url),'utf8'));
  await db.exec('reset role');await db.query('update profiles set suspended=false where id=$1',[id(1)]);await db.query('update departments set active=false where id=$1',[id(20)]);
  await actor(1);await assert.rejects(readOnly('admin_approvals'),/管理権限/);
 }finally{await db.close();}
});

test('admin diagnostics preserve actionable fields but redact email, tokens, keys and SQL row data',()=>{
 const result=adminFailure({reference:'test-reference',operation:'admin_approvals',error:{
  code:'25006',message:'cannot execute SELECT FOR SHARE in a read-only transaction',
  details:'Key (email)=(private@example.com) Failing row contains (Private Person, private-password)',
  hint:'Bearer private-token token=short-secret sb_secret_example https://example.com/?key=key-value eyJabc.def.ghi',
  response:{email:'ignored@example.com'},
 }});
 assert.equal(result.code,'25006');assert.match(result.message,/SELECT FOR SHARE/);
 assert.ok('details' in result && 'hint' in result);
 const serialized=JSON.stringify(result);
 for(const secret of ['private@example.com','Private Person','private-password','private-token','short-secret','sb_secret_example','key-value','eyJabc.def.ghi','ignored@example.com'])assert.ok(!serialized.includes(secret),secret);
 assert.equal(adminFailure({error:{code:'PGRST202',message:'Could not find the function in the schema cache'},reference:'x',operation:'admin_users'}).code,'PGRST202');
});

test('actual admin read helper logs the received diagnostics and throws a generic correlation error',async()=>{
 const source=await readFile(new URL('../lib/admin.ts',import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2017}}).outputText;
 const exports={};const logs=[];
 vm.runInNewContext(compiled,{exports,process:{env:{NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'test-public-key'}},console:{error:(text)=>logs.push(JSON.parse(text))},require:(name)=>{
  if(name==='react')return require(name);
  if(name==='./server/performance')return {timedQuery:async(_name,work)=>work()};
  if(name==='./server/admin-log.mjs')return {adminFailure};
  if(name==='node:crypto')return {randomUUID:()=> 'test-reference'};
  return {};
 }});
 const error={code:'25006',message:'cannot execute SELECT FOR SHARE in a read-only transaction',details:'email=private@example.com test-public-key',hint:'token=secret'};
 await assert.rejects(exports.adminRead({user:{email:'private@example.com'},db:{rpc:async()=>({data:null,error})}},'admin_approvals'),/確認番号：test-reference/);
 assert.equal(logs[0].code,'25006');assert.equal(logs[0].operation,'admin_approvals');
 for(const field of ['message','details','hint'])assert.ok(field in logs[0]);
 assert.ok(!JSON.stringify(logs).includes('test-public-key'));assert.ok(!JSON.stringify(logs).includes('private@example.com'));
 assert.ok(!JSON.stringify(logs).includes('token=secret'));
 assert.equal((await exports.adminRead({user:{},db:{rpc:async()=>({data:[{request_id:'one'}],error:null})}},'admin_approvals')).length,1);
});

test('organization admin can render the actual /admin page with successful RPC data',async()=>{
 const compiled=ts.transpileModule(await readFile(new URL('../app/admin/page.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2017,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const exports={};let reads=0;
 vm.runInNewContext(compiled,{exports,require:(name)=>{
  if(name==='@/lib/server/performance')return {startTiming:()=>()=>{},timedQuery:async(_name,work)=>work()};
  if(name==='@/lib/admin')return {adminSession:async()=>({membership:{role:'organization_admin'}}),adminRead:async()=>{reads++;return [];}};
  if(name==='react/jsx-runtime'||name==='react')return require(name);
  return {__esModule:true,default:()=>null};
 }});
 const tree=await exports.default();assert.ok(tree);assert.equal(reads,0,'menu does not wait for counts');
 const stream=async element=>{if(Array.isArray(element)){await Promise.all(element.map(stream));return;}if(!element?.props)return;if(typeof element.type==='function'&&!element.props.href){await stream(await element.type(element.props));return;}await stream(element.props.children);};
 await stream(tree);assert.equal(reads,1);
 const links=[];const visit=(element)=>{if(Array.isArray(element)){element.forEach(visit);return;}if(!element?.props)return;if(element.props.href)links.push(element.props.href);visit(element.props.children);};visit(tree);
 assert.ok(links.includes('/admin/approvals'));assert.ok(links.includes('/admin/departments'));
});
