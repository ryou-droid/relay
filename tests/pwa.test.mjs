import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const origin = "https://relay.example";
async function worker() {
  const listeners = new Map();
  const stored = new Map();
  const network = [];
  const key = (request) => new URL(typeof request === "string" ? request : request.url, origin).href;
  const cache = {
    async addAll(paths) { for (const path of paths) stored.set(key(path), new Response(path)); },
    async match(request) { return stored.get(key(request))?.clone(); },
    async put(request, response) { stored.set(key(request), response); },
    async keys() { return [...stored.keys()].map((url) => new Request(url)); },
    async delete(request) { return stored.delete(key(request)); },
  };
  let offline = false;
  vm.runInNewContext(await readFile(new URL("../public/sw.js", import.meta.url), "utf8"), {
    URL, Response,
    self: {
      location: { origin },
      clients: { claim: async () => {} },
      addEventListener: (name, callback) => listeners.set(name, callback),
    },
    caches: { open: async () => cache, match: cache.match, keys: async () => [], delete: async () => true },
    fetch: async (request) => {
      network.push(key(request));
      if (offline) throw new TypeError("offline");
      const response = new Response("network content");
      Object.defineProperty(response, "type", { value: "basic" });
      return response;
    },
  });
  await new Promise((resolve, reject) => listeners.get("install")({ waitUntil: (p) => p.then(resolve, reject) }));
  return {
    stored, network,
    setOffline: () => { offline = true; },
    async fetch(path, { mode = "cors", method = "GET", headers = {} } = {}) {
      let result;
      const pending = [];
      listeners.get("fetch")({
        request: { url: new URL(path, origin).href, mode, method, headers: new Headers(headers) },
        respondWith: (p) => { result = p; },
        waitUntil: (p) => pending.push(p),
      });
      const response = result ? await result : undefined;
      await Promise.all(pending);
      return response;
    },
  };
}

test("service worker caches only public shell/assets; private data and mutations stay online", async () => {
  const sw = await worker();
  assert.equal(await sw.fetch("/auth/recovery?code=private", { mode: "navigate" }), undefined);
  assert.equal(await sw.fetch("/auth/confirm?token_hash=private", { mode: "navigate" }), undefined);
  assert.equal(await sw.fetch("/login", { method: "POST" }), undefined);
  assert.equal(await sw.fetch("https://project.supabase.co/rest/v1/posts"), undefined);
  for (const path of ["/api/posts", "/posts/private?_rsc=abc", "/_next/image?url=private", "/icons/relay-192.png?token=private"])
    assert.equal(await sw.fetch(path), undefined);
  assert.equal(await (await sw.fetch("/posts/private", { mode: "navigate" })).text(), "network content");
  assert.ok(!sw.stored.has(`${origin}/posts/private`));
  const asset = "/_next/static/chunks/hashed-file.js";
  await sw.fetch(asset);
  assert.ok(sw.stored.has(`${origin}${asset}`));
  sw.setOffline();
  assert.equal(await (await sw.fetch(asset)).text(), "network content");
  assert.equal(await (await sw.fetch("/posts/private", { mode: "navigate" })).text(), "/offline.html");
  assert.ok([...sw.stored.keys()].every((url) => !url.includes("private")));
});

test("PWA icon PNG dimensions and favicon are valid", async () => {
  for (const [name, size] of [["relay-192.png", 192], ["relay-512.png", 512], ["relay-maskable-512.png", 512], ["apple-touch-icon.png", 180]]) {
    const png = await readFile(new URL(`../public/icons/${name}`, import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
  const ico = await readFile(new URL("../public/favicon.ico", import.meta.url));
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 1);
});
