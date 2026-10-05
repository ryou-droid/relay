import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
// Use actual server React.cache; a fresh dispatcher cache represents each RSC request.
const react = require(join(dirname(require.resolve('react')), 'react.react-server.js'));
const internals = react.__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

test('session deduplicates within a request, loads independent data concurrently, and rechecks next request', async () => {
  const source = await readFile(new URL('../lib/session.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  let actor = 'a', suspended = false, active = true, role = 'organization_admin';
  const calls = { auth: 0, profiles: 0, memberships: 0 };
  let releases = [];
  const db = { auth: { getUser: async () => { calls.auth++; return { data: { user: { id: actor } } }; } }, from: table => {
    const query = { select: () => query, eq: () => query };
    const execute = () => { calls[table]++; return new Promise(resolve => releases.push(() => resolve({ data: table === 'profiles' ? { suspended, full_name: actor, position: '社員' } : { role, departments: { active, name: '部署' } }, error: null }))); };
    return Object.assign(query, { single: execute, maybeSingle: execute });
  } };
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: name => {
    if (name === 'react') return react;
    if (name === './supabase') return { configured: () => true, supabase: async () => db };
    if (name === 'next/navigation') return { redirect: path => { throw new Error(path); } };
    throw new Error(name);
  } });
  const startRequest = () => { const cache = new Map(); internals.A = { getCacheForType: factory => { if (!cache.has(factory)) cache.set(factory, factory()); return cache.get(factory); } }; releases = []; };
  const complete = async () => { await new Promise(resolve => setImmediate(resolve)); assert.equal(releases.length, 2, 'both independent queries started before either resolves'); releases.forEach(release => release()); };
  try {
    startRequest();
    const layout = exports.session(), page = exports.session(), optional = exports.session(false);
    await complete(); const results = await Promise.all([layout, page, optional]);
    assert.equal(results[0], results[1]); assert.equal(results[0], results[2]);
    assert.deepEqual(calls, { auth: 1, profiles: 1, memberships: 1 });
    actor = 'b'; role = 'user'; startRequest(); const next = exports.session(); await complete();
    assert.equal((await next).user.id, 'b'); assert.equal((await exports.session()).membership.role, 'user');
    suspended = true; startRequest(); const stopped = assert.rejects(exports.session(), /\/suspended/); await complete(); await stopped;
    assert.equal((await exports.session(false)).membership, null);
    suspended = false; active = false; startRequest(); const waiting = assert.rejects(exports.session(), /\/waiting/); await complete(); await waiting;
    assert.deepEqual(calls, { auth: 4, profiles: 4, memberships: 4 });
  } finally { internals.A = null; }
});

test('already-read detail skips RPC and refresh; unread detail saves and refreshes once', async () => {
  const compiled = ts.transpileModule(await readFile(new URL('../components/detail-read.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  let calls = 0, refreshes = 0, browserClients = 0, effect;
  const exports = {};
  vm.runInNewContext(compiled, { exports, process: { env: {} }, require: name => {
    if (name === 'react') return { useRef: () => ({ current: null }), useState: () => [false, () => {}], useEffect: fn => { effect = fn; } };
    if (name === 'next/navigation') return { useRouter: () => ({ refresh: () => { refreshes++; } }) };
    if (name === '@supabase/ssr') return { createBrowserClient: () => { browserClients++; return { rpc: async () => { calls++; return { error: null }; } }; } };
    if (name === 'react/jsx-runtime') return require(name);
    throw new Error(name);
  } });
  exports.default({ id: 'post', alreadyRead: true }); effect();
  assert.equal(browserClients, 0); assert.equal(calls, 0); assert.equal(refreshes, 0);
  exports.default({ id: 'post', alreadyRead: false }); effect(); effect();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1); assert.equal(refreshes, 1);
});

test('actual detail starts all five scoped reads together and rejects invisible posts', async () => {
  const compiled = ts.transpileModule(await readFile(new URL('../app/app/posts/[id]/page.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {}; let releases = [], visible = true, authorized = true;
  const read = name => new Promise(resolve => releases.push(() => resolve({ error: null, data: name === 'posts' ? (visible ? { id: 'p', author_id: 'other', status: 'pending' } : null) : [] })));
  const db = { rpc: read, from: name => { const query = { select: () => query, eq: () => query, maybeSingle: () => read(name), order: () => read(name) }; return query; } };
  vm.runInNewContext(compiled, { exports, require: name => {
    if (name === '@/lib/session') return { session: async () => { if (!authorized) throw new Error('/waiting'); return { db, user: { id: 'me' } }; } };
    if (name === 'next/navigation') return { notFound: () => { throw new Error('NOT_FOUND'); } };
    if (name === 'react/jsx-runtime') return require(name);
    if (name === '@/lib/domain') return { kinds: {}, priorities: {}, statuses: {}, deadline: () => '' };
    return { __esModule: true, default: () => null };
  } });
  const props = { params: Promise.resolve({ id: 'p' }), searchParams: Promise.resolve({}) };
  for (const value of [true, false]) {
    visible = value; releases = []; const rendering = exports.default(props);
    const result = value ? rendering : assert.rejects(rendering, /NOT_FOUND/);
    await new Promise(resolve => setImmediate(resolve)); assert.equal(releases.length, 5);
    releases.forEach(resolve => resolve()); await result;
  }
  releases = []; authorized = false;
  await assert.rejects(exports.default(props), /\/waiting/); assert.equal(releases.length, 0);
});

test('proxy uses verified claims and preserves refresh cookies, without a second getUser', async () => {
  const compiled = ts.transpileModule(await readFile(new URL('../proxy.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {}; let claims = 0; const forwarded = [], returned = [];
  vm.runInNewContext(compiled, { exports, process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.test', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'public-test' } }, require: name => {
    if (name === '@supabase/ssr') return { createServerClient: (_url, _key, options) => ({ auth: { getClaims: async () => { claims++; options.cookies.setAll([{ name: 'refreshed', value: 'test', options: { httpOnly: true } }]); return { data: null, error: new Error('invalid token') }; }, getUser: () => { throw new Error('duplicate verification'); } } }) };
    if (name === 'next/server') return { NextResponse: { next: () => ({ cookies: { set: (...args) => returned.push(args) } }) } };
    throw new Error(name);
  } });
  await exports.proxy({ cookies: { getAll: () => [], set: (...args) => forwarded.push(args) } });
  assert.equal(claims, 1); assert.equal(forwarded.length, 1); assert.equal(returned.length, 1);
  // Invalid claims are not used as identity: the protected page still calls session/getUser.
});

test('navigation feedback is synchronous, survives pointer-up and clears on completion, replacement or failure', async () => {
  const source = await readFile(new URL('../lib/navigation-feedback.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const feedback = {}; let timeout; let cancelled = 0;
  vm.runInNewContext(compiled, { exports: feedback, URL, setTimeout: callback => { timeout = callback; return 1; }, clearTimeout: () => { cancelled++; } });
  const anchor = href => {
    const attributes = new Map();
    return { href, ownerDocument: { location: { href: 'https://relay.test/app?category=new' } }, getAttribute: key => attributes.get(key) ?? null, setAttribute: (key, value) => attributes.set(key, value), removeAttribute: key => attributes.delete(key) };
  };
  const post = anchor('https://relay.test/app/posts/new');
  feedback.beginNavigationFeedback(post);
  assert.equal(post.getAttribute('data-navigation-intent'), 'true');
  assert.equal(post.getAttribute('aria-busy'), 'true');
  const category = anchor('https://relay.test/app?category=unread');
  feedback.beginNavigationFeedback(category);
  assert.equal(post.getAttribute('data-navigation-intent'), null);
  assert.equal(category.getAttribute('data-navigation-intent'), 'true');
  feedback.finishNavigationFeedback();
  assert.equal(category.getAttribute('aria-busy'), null);
  for (const href of ['https://relay.test/app?category=new', 'https://relay.test/app?category=new#top', 'https://other.test/app']) {
    const link = anchor(href); feedback.beginNavigationFeedback(link);
    assert.equal(link.getAttribute('aria-busy'), null);
  }
  post.setAttribute('aria-busy', 'false'); feedback.beginNavigationFeedback(post); timeout();
  assert.equal(post.getAttribute('aria-busy'), 'false'); assert.ok(cancelled > 0);

  const component = ts.transpileModule(await readFile(new URL('../components/navigation-link.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  vm.runInNewContext(component, { exports, require: name => {
    if (name === 'react') return { useRef: current => ({ current }) };
    if (name === 'react/jsx-runtime') return require(name);
    if (name === 'next/link') return { __esModule: true, default: 'a', useLinkStatus: () => ({ pending: false }) };
    if (name === '@/lib/navigation-feedback') return feedback;
    throw new Error(name);
  } });
  const tree = exports.default({ href: '/app/posts/new', children: '投稿' });
  tree.props.ref.current = post;
  const event = { button: 0, clientX: 10, clientY: 10, currentTarget: post, defaultPrevented: false };
  tree.props.onPointerDown(event); assert.equal(post.getAttribute('data-pressed'), 'true');
  tree.props.onPointerMove({ ...event, clientX: 40 }); assert.equal(post.getAttribute('data-pressed'), null);
  tree.props.onPointerDown(event); tree.props.onPointerCancel(event); assert.equal(post.getAttribute('data-pressed'), null);
  tree.props.onPointerDown(event); tree.props.onPointerUp(event); assert.equal(post.getAttribute('data-pressed'), null);
  tree.props.onNavigate({ preventDefault: () => { throw new Error('normal navigation must not be blocked'); } });
  assert.equal(post.getAttribute('data-navigation-intent'), 'true');
  feedback.finishNavigationFeedback();
  const blocked = exports.default({ href: '/app/posts/new', children: '投稿', onNavigate: event => event.preventDefault() });
  blocked.props.ref.current = post; let prevented = false;
  blocked.props.onNavigate({ preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true); assert.equal(post.getAttribute('data-navigation-intent'), null);
});

test('actual home empty state has one next action and no redundant notice/catchphrase cards', async () => {
  const compiled = ts.transpileModule(await readFile(new URL('../app/app/page.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {}; let notices = [];
  vm.runInNewContext(compiled, { exports, require: name => {
    if (name === '@/lib/session') return { session: async () => ({ db: { rpc: async () => ({ data: [], error: null }), from: table => { const query = { select: () => query, order: async () => ({ data: [], error: null }), eq: async () => ({ data: notices, error: null }) }; assert.ok(['posts', 'important_notices'].includes(table)); return query; } } }) };
    if (name === 'react/jsx-runtime') return require(name);
    return { __esModule: true, default: 'a' };
  } });
  const props = { searchParams: Promise.resolve({}) };
  const inspect = tree => {
    const result = { text: [], notices: 0, actions: [] };
    const visit = node => { if (Array.isArray(node)) return node.forEach(visit); if (typeof node === 'string') { result.text.push(node); return; } if (!node?.props) return; if (node.props.className === 'important-notice') result.notices++; if (node.props.className === 'button' && node.props.href === '/app/posts/new') result.actions.push(node.props.href); visit(node.props.children); };
    visit(tree); return result;
  };
  const empty = inspect(await exports.default(props));
  assert.equal(empty.notices, 0); assert.equal(empty.actions.length, 1);
  assert.ok(empty.text.includes('今日の引き継ぎ')); assert.ok(empty.text.includes('投稿はありません'));
  assert.ok(!empty.text.join('').includes('ひとつずつ')); assert.ok(!empty.text.join('').includes('投稿しましょう'));
  notices = [{ id: 'n', department_id: null, body: '実際の重要連絡' }];
  const active = inspect(await exports.default(props));
  assert.equal(active.notices, 1); assert.ok(active.text.includes('実際の重要連絡'));
});
