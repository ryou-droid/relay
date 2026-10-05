import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feedDatabase, actor, id } from './helpers/feed-db.mjs';

test('real feed SQL bounds aggregation, keyset pages and tenant/role permissions in read-only transactions', async () => {
 const db = await feedDatabase();
 try {
  await actor(db, 2);await db.exec('begin read only');
  const get = async (view, filter, cursor=null) => (await db.query('select post_feed($1,$2,$3,$4) value',[view,filter,cursor?.created_at || null,cursor?.id || null])).rows[0].value;
  const first = await get('history','completed'); assert.equal(first.items.length,30); assert.ok(first.next);
  assert.equal('body' in first.items[0].post,false);
  const second = await get('history','completed',first.next); assert.equal(second.items.length,30);
  assert.equal(new Set([...first.items,...second.items].map(x=>x.post.id)).size,60);
  for(const item of first.items)assert.equal(item.summary.member_count,2);
  const home=(await db.query('select home_feed() value')).rows[0].value;
  for(const [key,page] of Object.entries(home)) {
   assert.ok(page.items.length<=30,key);
   assert.ok(page.items.every(x=>!['他組織','他部署'].includes(x.post.title)));
  }
  assert.equal(home.new.items.length,30);assert.equal(home.today.items.length,30);
  const summaries=(await db.query('select * from post_summaries_for($1)',[[first.items[0].post.id,id(10000),id(10001)]])).rows;
  assert.equal(summaries.length,1);
  await db.exec('rollback');
  const all=new Set();let cursor=null;
  do {const page=await get('history','completed',cursor);for(const item of page.items){assert.ok(!all.has(item.post.id));all.add(item.post.id);}cursor=page.next;}while(cursor);
  assert.equal(all.size,1100);
  await assert.rejects(get('home','bad'),/取得条件/);
  await assert.rejects(db.query("select post_feed('history','completed',null,null,1000)"),/取得条件/);
  await assert.rejects(db.query('select admin_dashboard()'),/管理権限/);
  await actor(db,1);assert.equal((await get('history','mine')).items.length,0);assert.equal((await get('history','involved')).items.length,30);await db.exec('begin read only');assert.equal((await db.query('select * from admin_dashboard()')).rows[0].pending_count,0);await db.exec('rollback');
  await db.exec('reset role');
  await db.exec(`insert into organization_invitations(id,organization_id,department_id,created_by)values('${id(30)}','${id(10)}','${id(21)}','${id(1)}');insert into join_requests(user_id,organization_id,department_id,invitation_id)values('${id(5)}','${id(10)}','${id(21)}','${id(30)}');`);
  for(const [n,count] of [[1,1],[3,1],[4,0]]){await actor(db,n);assert.equal((await db.query('select * from admin_dashboard()')).rows[0].pending_count,count);}
  for(const [n,title] of [[3,'他部署'],[4,'他組織']]){await actor(db,n);const page=await get('home','new');assert.equal(page.items.length,1);assert.equal(page.items[0].post.title,title);}
  for(const n of [5,null]) {await actor(db,n);await assert.rejects(get('home','new'),/所属/);assert.equal((await db.query('select * from post_summaries_for($1)',[[first.items[0].post.id]])).rows.length,0);}
  await db.exec('reset role');await db.query('update profiles set suspended=true where id=$1',[id(2)]);await actor(db,2);await assert.rejects(get('history','mine'),/所属/);
  await db.exec('reset role');await db.query('update profiles set suspended=false where id=$1',[id(2)]);await db.query('update departments set active=false where id=$1',[id(20)]);await actor(db,2);await assert.rejects(get('home','new'),/所属/);
  await db.exec('reset role');
  assert.equal((await db.query("select has_function_privilege('anon','public.home_feed()','EXECUTE') allowed")).rows[0].allowed,false);
  assert.equal((await db.query("select has_function_privilege('authenticated','public.feed_involved(uuid,uuid)','EXECUTE') allowed")).rows[0].allowed,false);
 } finally {await db.close();}
});
