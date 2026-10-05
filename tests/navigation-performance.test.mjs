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
