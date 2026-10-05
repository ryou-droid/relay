// Local SQL fixture benchmark; never connects to Supabase or logs real records.
import { performance } from 'node:perf_hooks';
import { feedDatabase, actor, id } from '../tests/helpers/feed-db.mjs';
const db = await feedDatabase();
try {
 await actor(db,2);
 const cases=[
  ['旧履歴（全件＋全件集計）',async()=>{const posts=await db.query('select * from posts');const summaries=await db.query('select * from post_summaries()');return {rows:posts.rows.length+summaries.rows.length,bytes:Buffer.byteLength(JSON.stringify([posts.rows,summaries.rows]))};}],
  ['新履歴（30件）',async()=>{const result=(await db.query("select post_feed('history','completed') value")).rows[0].value;return {rows:result.items.length,bytes:Buffer.byteLength(JSON.stringify(result))};}],
  ['新ホーム（6カテゴリ・各30件まで）',async()=>{const result=(await db.query('select home_feed() value')).rows[0].value;return {rows:Object.values(result).reduce((n,p)=>n+p.items.length,0),bytes:Buffer.byteLength(JSON.stringify(result))};}],
 ];
 for(const [name,run] of cases) {await run();const times=[];let size;for(let i=0;i<3;i++){const start=performance.now();size=await run();times.push(performance.now()-start);}console.log(JSON.stringify({fixture_posts:1200,case:name,mean_ms:Math.round(times.reduce((a,b)=>a+b)/times.length),...size}));}
 await db.exec('reset role');await db.exec('analyze posts');
 const plan=await db.query('explain (format json) select id,title from posts where department_id=$1 and deleted_at is null and status=\'completed\' order by created_at desc,id desc limit 31',[id(20)]);
 const inspect=node=>{if(node['Index Name'])console.log(JSON.stringify({index:node['Index Name']}));for(const child of node.Plans||[])inspect(child);};inspect(plan.rows[0]['QUERY PLAN'][0].Plan);
}finally{await db.close();}
