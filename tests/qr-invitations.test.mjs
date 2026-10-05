import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { feedDatabase, actor, id } from './helpers/feed-db.mjs';
import jsQR from 'jsqr';
import ts from 'typescript';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);

async function module(path, dependencies={}) {
 const exports={}; const compiled=ts.transpileModule(await readFile(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 vm.runInNewContext(compiled,{exports,URL,require:name=>name in dependencies?dependencies[name]:require(name)});return exports;
}

test('actual invitation SVG encodes a readable URL with a four-module quiet zone; origin is deployment configured',async()=>{
 const helpers=await module('../lib/invitation-qr.ts',{'./recovery-origin.mjs':{recoveryCallbackUrl:()=> 'https://relay-rouge-alpha.vercel.app/auth/recovery'}});
 for(const kind of ['user','admin']) {
  const url=helpers.invitationUrl(id(300),kind);
  assert.equal(new URL(url).pathname,'/register');assert.equal(new URL(url).searchParams.get('type'),kind);
  const svg=helpers.invitationQr(url);assert.ok(svg.includes('<svg'));assert.ok(!svg.includes('<script'));
  // Render the actual SVG's path rectangles into an image and decode independently.
  const size=Number(/viewBox="0 0 (\d+)/.exec(svg)[1]);
  const image=new Uint8ClampedArray(size*size*4).fill(255);
  const path=/ d="([^"]+)"/.exec(svg)[1];
  for(const match of path.matchAll(/M(\d+),(\d+)l(\d+),0 0,(\d+) -(\d+),0 0,-(\d+)z/g)) {
   const [,sx,sy,w,h]=match.map(Number);
   for(let y=sy;y<sy+h;y++)for(let x=sx;x<sx+w;x++){const i=(y*size+x)*4;image[i]=image[i+1]=image[i+2]=0;}
  }
  assert.equal(jsQR(image,size,size)?.data,url);
 }
});

test('real SQL snapshots trusted invitation kind, requires approval, isolates tenants and rejects role escalation',async()=>{
 const db=await feedDatabase();
 try {
  await db.exec(await readFile(new URL('../supabase/migrations/202610050005_qr_invitations.sql',import.meta.url),'utf8'));
  await actor(db,1);
  const create=async kind=>(await db.query('select create_qr_invitation($1) id',[kind])).rows[0].id;
  const ordinary=await create('user'),admin=await create('admin');
  assert.equal(await create('user'),ordinary);assert.equal(await create('admin'),admin);
  assert.equal((await db.query('select * from qr_invitations()')).rows.length,2);
  await assert.rejects(create('organization_admin'),/招待/);
  await db.exec('reset role');
  for(const [n,code,fake] of [[50,ordinary,'admin'],[51,admin,'user'],[52,admin,'user']])
   await db.query('insert into auth.users values($1,$2,now(),$3)',[id(n),`new${n}@example.test`,{full_name:'候補',planned_department:'営業',position:'社員',invitation_code:code,invite_type:fake,role:'organization_admin'}]);
  assert.equal((await db.query('select count(*)::int n from memberships where user_id=any($1)',[[id(50),id(51)]])).rows[0].n,0);
  assert.deepEqual((await db.query('select invite_type from join_requests where user_id=any($1) order by user_id',[[id(50),id(51)]])).rows.map(x=>x.invite_type),['user','admin']);
  const requests=(await db.query('select id,user_id from join_requests where user_id=any($1)',[[id(50),id(51),id(52)]])).rows;
  const request=n=>requests.find(r=>r.user_id===id(n)).id;
  // Even an operator assigning a department must not let its admin see/approve an admin candidate.
  await db.query('update join_requests set department_id=$1 where user_id=$2',[id(21),id(52)]);
  await actor(db,3);await assert.rejects(create('admin'),/招待/);await assert.rejects(create('user'),/招待/);
  await assert.rejects(db.query('select * from qr_invitations()'),/招待/);
  assert.equal((await db.query('select * from admin_approval_candidates()')).rows.length,0);
  assert.equal((await db.query('select * from admin_approvals()')).rows.length,0);
  assert.equal((await db.query('select * from join_requests where user_id=$1',[id(52)])).rows.length,0);
  await assert.rejects(db.query('select approve_user($1,$2)',[request(52),id(21)]),/承認/);
  await actor(db,4);assert.equal((await db.query('select * from admin_approval_candidates()')).rows.length,0);
  await assert.rejects(db.query('select approve_user($1,$2)',[request(51),id(22)]),/承認/);
  await actor(db,2);await assert.rejects(create('user'),/管理権限/);
  await assert.rejects(db.query('select approve_user($1,$2)',[request(51),id(20)]),/管理権限/);
  await assert.rejects(db.query("update organization_invitations set invite_type='admin' where id=$1",[ordinary]),/permission denied/);
  await actor(db,1);await db.exec('begin read only');
  assert.equal((await db.query('select * from admin_approval_candidates()')).rows.filter(r=>r.invite_type==='admin').length,2);await db.exec('rollback');
  await db.query('select approve_user($1,$2)',[request(50),id(20)]);
  await db.query('select approve_user($1,$2)',[request(51),id(20)]);
  await db.exec('reset role');
  assert.deepEqual((await db.query('select role from memberships where user_id=any($1) order by user_id',[[id(50),id(51)]])).rows.map(r=>r.role),['user','organization_admin']);
  await db.query('update organization_invitations set active=false where id=$1',[admin]);
  await db.exec('set role anon');
  assert.equal((await db.query('select invitation_kind($1) kind',[ordinary])).rows[0].kind,'user');
  assert.equal((await db.query('select invitation_kind($1) kind',[admin])).rows[0].kind,null);
  await assert.rejects(db.query("select create_qr_invitation('user')"),/permission denied/);
  await db.exec('reset role');
  await assert.rejects(db.query('insert into auth.users values($1,$2,now(),$3)',[id(53),'expired@example.test',{full_name:'無効',planned_department:'部署',position:'社員',invitation_code:admin}]),/無効|期限切れ/);
  assert.equal((await db.query('select count(*)::int n from auth.users where id=$1',[id(53)])).rows[0].n,0);
  await db.query('insert into auth.users values($1,$2,null,$3)',[id(54),'unconfirmed@example.test',{full_name:'未確認',planned_department:'部署',position:'社員',invitation_code:ordinary}]);
  const unconfirmed=(await db.query('select id from join_requests where user_id=$1',[id(54)])).rows[0].id;
  await db.query('update profiles set suspended=true where id=$1',[id(52)]);
  await actor(db,1);
  await assert.rejects(db.query('select approve_user($1,$2)',[unconfirmed,id(20)]),/メール確認/);
  await assert.rejects(db.query('select approve_user($1,$2)',[request(52),id(21)]),/メール確認/);
  await db.exec('reset role');await db.query("update organization_invitations set expires_at=now()-interval '1 day' where id=$1",[ordinary]);
  await db.exec('set role anon');assert.equal((await db.query('select invitation_kind($1) kind',[ordinary])).rows[0].kind,null);

 }finally{await db.close();}
});

test('register page ignores tampered URL type and takes the kind only from server lookup',async()=>{
 const calls=[];
 const db={rpc:async(name,args)=>{calls.push([name,args]);return {data:'user',error:null};}};
 const page=await module('../app/register/page.tsx',{'@/components/auth-form':{__esModule:true,default:'auth-form'},'@/lib/supabase':{configured:()=>true,supabase:async()=>db}});
 const tree=await page.default({searchParams:Promise.resolve({invite:id(30),type:'admin'})});
 assert.equal(tree.props.inviteType,'user');assert.equal(calls[0][0],'invitation_kind');
 db.rpc=async()=>({data:'admin',error:null});
 assert.equal((await page.default({searchParams:Promise.resolve({invite:id(30),type:'user'})})).props.inviteType,'admin');
 db.rpc=async()=>({data:null,error:null});
 assert.ok((await page.default({searchParams:Promise.resolve({invite:id(30)})})).props.error.includes('無効'));
});
