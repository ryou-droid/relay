import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { feedDatabase, actor, id } from './helpers/feed-db.mjs';
import ts from 'typescript';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
async function load(path, mocks={},globals={}) {
 const exports={};const source=await readFile(new URL(path,import.meta.url),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{exports,URL,Buffer,Response,...globals,require:name=> name in mocks ? mocks[name]: require(name)});return exports;
}
const key='A'.repeat(87),auth='A'.repeat(22);

test('actual database isolates subscriptions and queues only current same-department, active, opted-in recipients',async()=>{
 const db=await feedDatabase();
 try {
  await db.exec(await readFile(new URL('../supabase/migrations/202610050005_qr_invitations.sql',import.meta.url),'utf8'));
  await db.exec('create role service_role;grant usage on schema public to service_role;');
  await db.exec(await readFile(new URL('../supabase/migrations/202610060001_new_post_push.sql',import.meta.url),'utf8'));
  for(const n of [1,2,3,4]) {await actor(db,n);await db.query('select save_push_subscription($1,$2,$3,$4)',[`https://web.push.apple.com/device${n}`,key,auth,key]);}
  await actor(db,5);await assert.rejects(db.query('select save_push_subscription($1,$2,$3,$4)',['https://web.push.apple.com/pending',key,auth,key]),/所属/);
  await actor(db,2);
  assert.equal((await db.query('select endpoint from push_subscriptions')).rows.length,1);
  await assert.rejects(db.query('select auth_key from push_subscriptions'),/permission denied/);
  await assert.rejects(db.query('select * from push_outbox'),/permission denied/);
  await assert.rejects(db.query('select claim_push_jobs($1)',[key]),/permission denied/);
  await assert.rejects(db.query('select save_push_subscription($1,$2,$3,$4)',['https://127.0.0.1/internal',key,auth,key]),/無効/);
  await assert.rejects(db.query('update push_subscriptions set enabled=false'),/permission denied/);
  await actor(db,1);
  const create=async()=>(await db.query("select save_post(null,'秘密のタイトル','秘密の本文','notice','normal',now()+interval '1 hour','{}') id")).rows[0].id;
  const post=await create();
  await db.query("select save_post($1,'編集','編集した本文','notice','normal',now()+interval '1 hour','{}')",[post]);
  await db.exec('reset role');
  const pending=(await db.query('select * from push_outbox')).rows;
  assert.equal(pending.length,1);assert.equal(pending[0].user_id,id(2));assert.equal(pending[0].post_id,post);
  assert.equal('body' in pending[0],false);
  await db.exec('set role service_role');
  const claim=async()=>(await db.query('select * from claim_push_jobs($1,$2)',[key,post])).rows;
  const jobs=await claim();assert.equal(jobs.length,1);assert.equal((await claim()).length,0);
  const job=jobs[0];
  assert.equal((await db.query('select authorize_push_job($1,$2,$3) allowed',[job.job_id,job.lease,key])).rows[0].allowed,true);
  await actor(db,2);assert.equal((await db.query('select can_show_push($1) allowed',[job.job_id])).rows[0].allowed,true);
  await actor(db,1);assert.equal((await db.query('select can_show_push($1) allowed',[job.job_id])).rows[0].allowed,false);
  await db.exec('reset role');await db.query('update profiles set suspended=true where id=$1',[id(2)]);await db.exec('set role service_role');
  assert.equal((await db.query('select authorize_push_job($1,$2,$3) allowed',[job.job_id,job.lease,key])).rows[0].allowed,false);
  await actor(db,2);assert.equal((await db.query('select can_show_push($1) allowed',[job.job_id])).rows[0].allowed,false);
  await actor(db,1);await create();await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from push_outbox')).rows[0].n,1);
  await db.query('update profiles set suspended=false where id=$1',[id(2)]);
  await db.query('update memberships set department_id=$1 where user_id=$2',[id(21),id(2)]);
  await db.exec('set role service_role');assert.equal((await db.query('select authorize_push_job($1,$2,$3) allowed',[job.job_id,job.lease,key])).rows[0].allowed,false);
  await db.exec('reset role');await db.query('update memberships set department_id=$1 where user_id=$2',[id(20),id(2)]);
  await db.exec('set role service_role');await db.query("select finish_push_job($1,$2,'sent')",[job.job_id,id(999)]);
  await db.exec('reset role');assert.equal((await db.query('select status from push_outbox')).rows[0].status,'processing');
  await db.exec('set role service_role');await db.query("select finish_push_job($1,$2,'sent')",[job.job_id,job.lease]);
  await actor(db,2);assert.equal((await db.query('select can_show_push($1) allowed',[job.job_id])).rows[0].allowed,true);
  await db.query('select disable_push_subscription($1)',['https://web.push.apple.com/device2']);
  assert.equal((await db.query('select can_show_push($1) allowed',[job.job_id])).rows[0].allowed,false);
  await actor(db,1);await create();await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from push_outbox')).rows[0].n,1);
  await actor(db,2);await db.query('select save_push_subscription($1,$2,$3,$4)',['https://web.push.apple.com/device2',key,auth,key]);
  await actor(db,1);const next=await create();await db.exec('reset role');await db.exec('set role service_role');
  const retry=(await db.query('select * from claim_push_jobs($1,$2)',[key,next])).rows[0];
  await db.query("select finish_push_job($1,$2,'retry')",[retry.job_id,retry.lease]);
  await db.exec('reset role');const state=(await db.query('select * from push_outbox where id=$1',[retry.job_id])).rows[0];
  assert.equal(state.status,'pending');assert.equal(state.attempts,1);assert.ok(state.available_at>state.created_at);
  await db.query('update push_outbox set available_at=now() where id=$1',[retry.job_id]);await db.exec('set role service_role');
  const again=(await db.query('select * from claim_push_jobs($1,$2)',[key,next])).rows[0];
  await db.query("select finish_push_job($1,$2,'expired')",[again.job_id,again.lease]);
  await actor(db,2);assert.equal((await db.query('select enabled from push_subscriptions')).rows[0].enabled,false);
 }finally{await db.close();}
});

test('dispatcher rechecks eligibility, restricts endpoints, sends no private fields and retries/removes expired devices',async()=>{
 const protocol=await load('../lib/push/protocol.ts');const dispatcher=await load('../lib/push/dispatcher.ts',{'./protocol':protocol});
 const jobs=[1,2,3,4].map(n=>({job_id:id(n),lease:id(n+10),post_id:id(100),endpoint:n===4?'https://localhost/private':`https://web.push.apple.com/device${n}`,p256dh:key,auth_key:auth}));
 let claimed=false;const sent=[],finished=[];
 const result=await dispatcher.drainPushQueue({key,rpc:async(name,args)=>{
  if(name==='claim_push_jobs'){const data=claimed?[]:jobs;claimed=true;return {data,error:null};}
  if(name==='authorize_push_job')return {data:args.p_id!==id(2),error:null};
  finished.push(args);return {data:null,error:null};
 },send:async(job,payload)=>{sent.push(JSON.parse(payload));if(job.job_id===id(3))throw {statusCode:410,body:'secret provider URL'};}});
 assert.equal(result.sent,1);assert.equal(result.skipped,3);
 assert.equal(finished.find(x=>x.p_id===id(3)).p_result,'expired');
 for(const payload of sent)assert.deepEqual(Object.keys(payload).sort(),['event_id','kind','post_id']);
 assert.equal(protocol.validEndpoint('https://web.push.apple.com@evil.example/path'),false);
 assert.equal(protocol.validEndpoint('https://fcm.googleapis.com:8443/path'),false);
 assert.equal(protocol.validEndpoint('https://169.254.169.254/path'),false);
});

test('service worker verifies current account before display; forged URLs and private payload text are ignored',async()=>{
 const listeners={},shown=[],opened=[];let allowed=true,online=true;
 vm.runInNewContext(await readFile(new URL('../public/sw.js',import.meta.url),'utf8'),{
  URL,Response,self:{location:{origin:'https://relay.example'},registration:{showNotification:async(...args)=>shown.push(args)},
  clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)},addEventListener:(name,fn)=>{listeners[name]=fn;}},
  fetch:async()=>{if(!online)throw new Error('offline');return Response.json({allowed});},
 });
 const push=async data=>{let waiting;listeners.push({data:{json:()=>data},waitUntil:p=>{waiting=p;}});await waiting;};
 const payload={kind:'new_post',event_id:id(1),post_id:id(2),body:'秘密の本文',name:'秘密の氏名',url:'https://evil.example'};
 await push(payload);assert.equal(shown.length,1);assert.equal(shown[0][0],'Relay');assert.equal(shown[0][1].body,'新しい投稿が追加されました');
 assert.equal(shown[0][1].data.url,`/app/posts/${id(2)}`);
 allowed=false;await push(payload);assert.equal(shown.length,1);
 allowed=true;online=false;await push(payload);assert.equal(shown.length,1);
 online=true;await push({...payload,kind:'important_notice'});assert.equal(shown.length,1);
 let waiting;listeners.notificationclick({notification:{close(){},data:{url:'https://evil.example'}},waitUntil:p=>{waiting=p;}});await waiting;
 assert.deepEqual(opened,['https://relay.example/app']);
});

test('dispatch HTTP entry rejects missing/wrong tokens before processing; only server secret authorizes it',async()=>{
 let calls=0;const route=await load('../app/api/push/dispatch/route.ts',{'@/lib/server/push-dispatch':{dispatchPostNotifications:async()=>{calls++;return {sent:1};}}},{process:{env:{PUSH_DISPATCH_TOKEN:'x'.repeat(40)}}});
 assert.equal((await route.POST(new Request('https://relay.example/api/push/dispatch'))).status,401);
 assert.equal((await route.POST(new Request('https://relay.example/api/push/dispatch',{headers:{authorization:'Bearer wrong'}}))).status,401);assert.equal(calls,0);
 assert.equal((await route.POST(new Request('https://relay.example/api/push/dispatch',{headers:{authorization:'Bearer '+'x'.repeat(40)}}))).status,200);assert.equal(calls,1);
});

test('actual settings asks permission only on explicit ON, persists after subscribe, and disables before unsubscribe',async()=>{
 const states=[],effects=[],events=[];let cursor=0,first=true,current=null;
 const subscription={endpoint:'https://web.push.apple.com/device',options:{},toJSON:()=>({endpoint:'https://web.push.apple.com/device',keys:{p256dh:key,auth}}),unsubscribe:async()=>{events.push('unsubscribe');current=null;return true;}};
 const registration={active:{postMessage:(_message,ports)=>ports[0].reply({newPostPush:true})},pushManager:{getSubscription:async()=>current,subscribe:async()=>{events.push('subscribe');current=subscription;return subscription;}}};
 class Channel {constructor(){this.port1={onmessage:null,close(){}};this.port2={reply:data=>this.port1.onmessage({data})};}}
 const Notification={permission:'granted',requestPermission:()=>{events.push('permission');return Promise.resolve('granted');}};
 const component=await load('../components/push-settings.tsx',{
  react:{useState:init=>{const index=cursor++;if(!(index in states))states[index]=init;return [states[index],value=>{states[index]=value;}];},useEffect:effect=>{if(first)effects.push(effect);}},
  '@/app/push-actions':{enablePush:async()=>{events.push('save');},disablePush:async()=>{events.push('disable');},pushStatus:async()=>false},
 },{Uint8Array,atob,MessageChannel:Channel,setTimeout,clearTimeout,Notification,window:{isSecureContext:true,PushManager:function(){},Notification},navigator:{serviceWorker:{getRegistration:async()=>registration,ready:Promise.resolve(registration)}},process:{env:{NODE_ENV:'production',NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY:key}}});
 const render=()=>{cursor=0;const result=component.default({configured:true});first=false;return result;};
 render();for(const effect of effects)effect();await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(events,[]);
 const tree=render();const button=tree.props.children.find(element=>element?.type==='button');assert.equal(button.props.disabled,false);
 const turningOn=button.props.onClick();assert.deepEqual(events,['permission']);await turningOn;
 assert.deepEqual(events,['permission','subscribe','save']);
 const off=render().props.children.find(element=>element?.type==='button');await off.props.onClick();
 assert.deepEqual(events,['permission','subscribe','save','disable','unsubscribe']);
});
