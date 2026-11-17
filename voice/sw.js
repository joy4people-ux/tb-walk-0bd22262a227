// Keeps the voice test page and the engine on the phone; the voice model itself is kept by the page (Cache Storage "tb-offline-voice-st3-v1").
const V = "tb-offline-voice-shell-1794871421359";
const FILES = ["./", "index.html", "voice.js", "voice-engine.mjs", "ort/ort.webgpu.min.mjs", "ort/ort-wasm-simd-threaded.jsep.mjs", "ort/ort-wasm-simd-threaded.jsep.wasm"];
self.addEventListener("install", (e) => e.waitUntil(caches.open(V).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x.startsWith("tb-offline-voice-shell-") && x !== V).map((x) => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const q = e.request; if (q.method !== "GET") return;
  const u = new URL(q.url); if (u.origin !== location.origin) return;
  e.respondWith((async () => {
    if (u.pathname.endsWith("/model/manifest.json")) { try { return await fetch(q); } catch (err) { const h = await caches.match(q, { ignoreSearch: true }); if (h) return h; throw err; } }
    const h = await caches.match(q.mode === "navigate" ? "./" : q, { ignoreSearch: true }); if (h) return h; return fetch(q);
  })());
});
