// Shared offline voice engine for the Explorer maps and the «Голос без интернета» test page (Owner 2026-11-16).
// Supertonic 3 (Supertone, OpenRAIL-M): one download from OUR address into the phone (Cache Storage), then synthesis runs in the browser, offline.
// Synthesis steps follow the official Supertonic web example (MIT, supertone-oss-archive/supertonic/web/helper.js).
import * as ort from "./ort/ort.webgpu.min.mjs";

const BASE = new URL("./", import.meta.url);
ort.env.wasm.wasmPaths = new URL("ort/", BASE).href;
ort.env.wasm.numThreads = 1; // GitHub Pages cannot send the headers needed for threads
export const CACHE = "tb-offline-voice-st3-v1";
export const VOICES = { m: ["M1", "M2", "M3", "M4", "M5"], f: ["F1", "F2", "F3", "F4", "F5"] };
export const LANGS = ["en", "ko", "ja", "ar", "bg", "cs", "da", "de", "el", "es", "et", "fi", "fr", "hi", "hr", "hu", "id", "it", "lt", "lv", "nl", "pl", "pt", "ro", "ru", "sk", "sl", "sv", "tr", "uk", "vi"];
const abs = (p) => new URL(p, BASE).href;
// The engine file carries its version in the name (voice-engine.<hash>.mjs), so a fixed engine reaches phones that already downloaded the voice.
const SELF = new URL(import.meta.url).pathname.split("/").pop();
let MANIFEST = null, TTS = null; const STYLE = {}; export const LAST = { peak: 0, bad: 0 };

export async function manifest() {
  if (MANIFEST) return MANIFEST;
  const url = abs("model/manifest.json"); const c = await caches.open(CACHE);
  try { const r = await fetch(url, { cache: "no-cache" }); if (r.ok) { MANIFEST = await r.clone().json(); await c.put(url, r); return MANIFEST; } } catch (e) {}
  const h = await c.match(url); MANIFEST = h ? await h.json() : null; return MANIFEST;
}
// How the voice is made on this device: "gpu" (graphics chip, WebGPU), "cpu" (processor) or "" (too slow: the phone's own voice).
// Graphics chip first everywhere (full quality, 8 steps): the Owner heard the processor's lighter mode on his iPhone as robotic
// (2026-11-17), and the page memory of the graphics-chip way is now ≈6× smaller than when it reset his map. If it still resets
// the page, the map marks "tb-nv-cpu" and uses the processor next time (iPhone measured: 5.2 s phrase in 6.0 s at 8 steps,
// 3.0 s at 4 steps, no reset). Phones without a graphics chip for pages (many Android) use the processor; a PC's processor
// in the browser is too slow, so a PC without it keeps its own voice.
export const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
export const PHONE = IOS || /Android|Mobile/.test(navigator.userAgent);
export async function canRun() {
  let cpu = false; try { cpu = !!localStorage.getItem("tb-nv-cpu"); } catch (e) {}
  if (/force-cpu/.test(location.search) || cpu) return "cpu";
  try { if (navigator.gpu && (await navigator.gpu.requestAdapter())) return "gpu"; } catch (e) {}
  return PHONE ? "cpu" : "";
}
export async function isDownloaded() {
  const m = await manifest(); if (!m) return false;
  try { const c = await caches.open(CACHE); for (const f of m.files) for (const p of f.parts) if (!(await c.match(abs(p)))) return false;
    for (const f of ["ort/ort.webgpu.min.mjs", "ort/ort-wasm-simd-threaded.jsep.mjs", "ort/ort-wasm-simd-threaded.jsep.wasm", SELF]) if (!(await c.match(abs(f)))) return false;
    return true; } catch (e) { return false; }
}
// After an engine update: the big model is already in the phone, only the small engine files are new — fetch them quietly.
export async function repair() {
  const m = await manifest(); if (!m) return false;
  try { const c = await caches.open(CACHE); for (const f of m.files) for (const p of f.parts) if (!(await c.match(abs(p)))) return false;
    for (const f of [SELF, "ort/ort.webgpu.min.mjs", "ort/ort-wasm-simd-threaded.jsep.mjs", "ort/ort-wasm-simd-threaded.jsep.wasm"]) if (!(await c.match(abs(f)))) await cachedFetch(abs(f));
    return true; } catch (e) { return false; }
}
export async function totalBytes() { const m = await manifest(); return m ? m.total + 22.3e6 : 0; }
async function cachedFetch(url, onBytes) {
  const c = await caches.open(CACHE); const h = await c.match(url);
  if (h) { const b = await h.arrayBuffer(); onBytes && onBytes(b.byteLength); return b; }
  const net = await fetch(url, { cache: "no-store" }); if (!net.ok) throw new Error("HTTP " + net.status);
  const reader = net.body.getReader(); const parts = []; let got = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); got += value.length; onBytes && onBytes(value.length); }
  const blob = new Blob(parts); await c.put(url, new Response(blob, { headers: { "Content-Type": net.headers.get("Content-Type") || "application/octet-stream" } }));
  return blob.arrayBuffer();
}
// One call downloads everything the voice needs (also the engine files, so the maps work in airplane mode).
export async function download(onBytes) {
  const m = await manifest(); if (!m) throw new Error("нет связи");
  for (const f of [SELF, "ort/ort.webgpu.min.mjs", "ort/ort-wasm-simd-threaded.jsep.mjs", "ort/ort-wasm-simd-threaded.jsep.wasm"]) await cachedFetch(abs(f), onBytes);
  for (const f of m.files) for (const p of f.parts) await cachedFetch(abs(p), onBytes);
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) {}
}
async function readFile(name) {
  const m = await manifest(); const f = m.files.find((x) => x.name === name);
  if (f.parts.length === 1) return new Uint8Array(await cachedFetch(abs(f.parts[0])));
  // Joined part by part, so the phone never holds the parts and the whole file at the same time (iPhone memory, 2026-11-17).
  const out = new Uint8Array(f.size); let o = 0; for (const p of f.parts) { const b = new Uint8Array(await cachedFetch(abs(p))); out.set(b, o); o += b.length; } return out;
}
// The weights are handed to the engine as «external data»: the browser sends them straight to the graphics chip
// and keeps only the small graph in page memory. On this PC page memory fell from about 1.1 GB; the iPhone page
// was reset by memory overflow (Owner, 2026-11-17). Same model file, nothing new to download: only the description
// of where each weight lies is rewritten (ONNX protobuf: graph 7 → initializer 5 → raw_data 9 becomes external_data 13).
const W = "weights.bin";
function rv(b, p) { let v = 0, m = 1, x; do { x = b[p++]; v += (x & 127) * m; m *= 128; } while (x & 128); return [v, p]; }
function wv(n) { const o = []; do { let x = n % 128; n = Math.floor(n / 128); if (n) x |= 128; o.push(x); } while (n); return Uint8Array.from(o); }
function cat(list) { let n = 0; for (const a of list) n += a.length; const o = new Uint8Array(n); let k = 0; for (const a of list) { o.set(a, k); k += a.length; } return o; }
function fields(b) { const out = []; let p = 0; while (p < b.length) { const s = p; let k; [k, p] = rv(b, p); const no = Math.floor(k / 8), wt = k % 8; let val;
  if (wt === 0) [val, p] = rv(b, p); else if (wt === 1) p += 8; else if (wt === 5) p += 4;
  else if (wt === 2) { let n; [n, p] = rv(b, p); val = b.subarray(p, p + n); p += n; } else throw new Error("onnx wire " + wt);
  out.push({ no, raw: b.subarray(s, p), val }); } return out; }
const ld = (no, u) => cat([wv(no * 8 + 2), wv(u.length), u]);
const ent = (k, v) => { const e = new TextEncoder(); return ld(13, cat([ld(1, e.encode(k)), ld(2, e.encode(v))])); };
function externalize(bytes) {
  const tensor = (t) => { const f = fields(t), raw = f.find((x) => x.no === 9); if (!raw || raw.val.length < 1024) return t;
    const keep = f.filter((x) => x.no !== 9 && x.no !== 13 && x.no !== 14).map((x) => x.raw);
    return cat([...keep, ent("location", W), ent("offset", String(raw.val.byteOffset - bytes.byteOffset)), ent("length", String(raw.val.length)), wv(14 * 8), wv(1)]); };
  const graph = (g) => cat(fields(g).map((x) => (x.no === 5 ? ld(5, tensor(x.val)) : x.raw)));
  return cat(fields(bytes).map((x) => (x.no === 7 ? ld(7, graph(x.val)) : x.raw)));
}
const readJson = async (name) => JSON.parse(new TextDecoder().decode(await readFile(name)));

export function engine() { return TTS; }
// The processor way runs in a background thread (Web Worker): made on the page itself, it froze the map for seconds
// per phrase (found on this PC 2026-11-17). The graphics-chip way stays on the page (it hardly occupies it).
const IN_WORKER = typeof window === "undefined";
let WK = null, wkId = 0; const wkWait = {};
function wk(op, args, onSay) { return new Promise((ok, no) => { const id = ++wkId; wkWait[id] = { ok, no, onSay }; WK.postMessage({ id, op, args }); }); }
export async function load(say) {
  if (TTS) return TTS;
  const how = await canRun();
  if (how === "cpu" && !IN_WORKER && typeof Worker !== "undefined") {
    try {
      WK = new Worker(import.meta.url, { type: "module" });
      WK.onmessage = (e) => { const m = e.data, w = wkWait[m.id]; if (!w) return; if (m.say) { w.onSay && w.onSay(m.say); return; } if (m.last) Object.assign(LAST, m.last); delete wkWait[m.id]; m.err ? w.no(new Error(m.err)) : w.ok(m.r); };
      const r = await wk("load", { how }, say);
      TTS = { ...r, remote: true }; return TTS;
    } catch (e) { try { WK && WK.terminate(); } catch (x) {} WK = null; } // no background thread: make it on the page
  }
  return loadHere(how, say);
}
async function loadHere(how, say) {
  const t0 = performance.now();
  let eps = how === "gpu" ? ["webgpu", "wasm"] : ["wasm"];
  const cfg = await readJson("tts.json"), indexer = await readJson("unicode_indexer.json");
  const ses = []; const names = ["duration_predictor.onnx", "text_encoder.onnx", "vector_estimator.onnx", "vocoder.onnx"];
  for (let i = 0; i < names.length; i++) {
    say && say("Включаю голос… " + (i + 1) + " из 4");
    let bytes = await readFile(names[i]), graph = externalize(bytes);
    const opt = (ep) => ({ executionProviders: ep, graphOptimizationLevel: "all", enableCpuMemArena: false, enableMemPattern: false, externalData: [{ path: W, data: bytes }] });
    try { ses.push(await ort.InferenceSession.create(graph, opt(eps))); }
    catch (e) { if (eps[0] !== "webgpu") throw e; eps = ["wasm"]; ses.push(await ort.InferenceSession.create(graph, opt(eps))); }
    bytes = graph = null; await new Promise((r) => setTimeout(r, 50)); // let the phone free the file before the next one
  }
  TTS = { cfg, indexer, dp: ses[0], enc: ses[1], est: ses[2], voc: ses[3], sr: cfg.ae.sample_rate, gpu: eps[0] === "webgpu", steps: eps[0] === "webgpu" ? 8 : 6 /* processor: 6 steps — 4 sounded robotic to the Owner, 8 is a little slower than speech on his iPhone */, secs: ((performance.now() - t0) / 1000).toFixed(1) };
  try { await synth("Да.", "ru", "M1", 2, 1); } catch (e) {} // warm the graphics chip so the first story starts sooner
  return TTS;
}
export async function style(id) {
  if (STYLE[id]) return STYLE[id];
  const j = await readJson("voice_styles/" + id + ".json");
  const t = (o) => new ort.Tensor("float32", Float32Array.from(o.data.flat(Infinity)), o.dims);
  return (STYLE[id] = { ttl: t(j.style_ttl), dp: t(j.style_dp) });
}
function prep(text, lang) {
  text = text.normalize("NFKD").replace(/[–‑—]/g, "-").replace(/[«»“”„]/g, '"').replace(/[‘’´`]/g, "'").replace(/[\[\]|\/#→←_]/g, " ")
    .replace(/ ([,.!?;:])/g, "$1").replace(/\s+/g, " ").trim();
  if (!/[.!?;:,'"')\]}…»]$/.test(text)) text += ".";
  return `<${lang}>${text}</${lang}>`;
}
function randn() { const u1 = Math.max(1e-4, Math.random()), u2 = Math.random(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); }
// Returns Float32Array samples at engine().sr. speed: 1 = normal; steps: 8 = best, 4 = lighter (about twice as fast).
// One phrase at a time: the engine cannot run two at once («Session already started»), e.g. when the voice is changed mid-story.
let queue = Promise.resolve();
export function synth(text, lang, voiceId, steps, speed) {
  const run = queue.then(() => (TTS && TTS.remote ? wk("synth", [text, lang, voiceId, steps, speed]) : synthNow(text, lang, voiceId, steps, speed)));
  queue = run.catch(() => {});
  return run;
}
async function synthNow(text, lang, voiceId, steps, speed) {
  const st = await style(voiceId); const p = prep(text, LANGS.includes(lang) ? lang : "na");
  const ids = new BigInt64Array(p.length); for (let j = 0; j < p.length; j++) { const cp = p.codePointAt(j); ids[j] = BigInt(cp < TTS.indexer.length ? TTS.indexer[cp] : -1); }
  const L = p.length, idsT = new ort.Tensor("int64", ids, [1, L]), maskT = new ort.Tensor("float32", new Float32Array(L).fill(1), [1, 1, L]);
  const dur = (await TTS.dp.run({ text_ids: idsT, style_dp: st.dp, text_mask: maskT })).duration.data[0] / (speed || 1);
  const emb = (await TTS.enc.run({ text_ids: idsT, style_ttl: st.ttl, text_mask: maskT })).text_emb;
  const chunk = TTS.cfg.ae.base_chunk_size * TTS.cfg.ttl.chunk_compress_factor, dim = TTS.cfg.ttl.latent_dim * TTS.cfg.ttl.chunk_compress_factor;
  const wavLen = Math.floor(dur * TTS.sr), len = Math.max(1, Math.floor((wavLen + chunk - 1) / chunk));
  let x = new Float32Array(dim * len); for (let i = 0; i < x.length; i++) x[i] = randn();
  const lmask = new ort.Tensor("float32", new Float32Array(len).fill(1), [1, 1, len]), tot = new ort.Tensor("float32", new Float32Array([steps]), [1]);
  for (let s = 0; s < steps; s++) {
    const out = await TTS.est.run({ noisy_latent: new ort.Tensor("float32", x, [1, dim, len]), text_emb: emb, style_ttl: st.ttl, latent_mask: lmask, text_mask: maskT,
      current_step: new ort.Tensor("float32", new Float32Array([s]), [1]), total_step: tot });
    x = Float32Array.from(out.denoised_latent.data);
  }
  const w = Float32Array.from((await TTS.voc.run({ latent: new ort.Tensor("float32", x, [1, dim, len]) })).wav_tts.data.subarray(0, wavLen));
  // Volume guard: the lighter mode (4 steps) gave peaks of 1.07–1.25 on this PC — over the limit, heard as a harsh clipped sound.
  // Broken numbers (graphics chip errors) become silence instead of a squeak.
  let peak = 0, bad = 0; for (let i = 0; i < w.length; i++) { if (!Number.isFinite(w[i])) { w[i] = 0; bad++; } const v = Math.abs(w[i]); if (v > peak) peak = v; }
  LAST.peak = peak; LAST.bad = bad; // raw numbers before the guard, for the «Проверка голоса» page
  if (peak > 0.9) { const k = 0.9 / peak; for (let i = 0; i < w.length; i++) w[i] *= k; }
  return w;
}
// Pieces for reading: the first one short (the sound starts sooner), the rest up to ~140 letters.
export function pieces(t, lang) {
  const max = lang === "ja" || lang === "ko" ? 70 : 140, out = []; // shorter pieces = less graphics memory at once (iPhone, 2026-11-17)
  (t.match(/[^.!?…]+[.!?…]+["»)]*\s*|[^.!?…]+$/g) || [t]).forEach((s) => { s = s.trim(); if (!s) return;
    if (out.length > 1 && out[out.length - 1].length + s.length < max) out[out.length - 1] += " " + s; else out.push(s); });
  return out;
}

// A reader that plays pieces one after another, making the next while the current one sounds.
export function reader() {
  let AC = null, srcs = [], token = 0;
  const R = { on: false, i: 0, made: 0, sound: 0, onPiece: null, onEnd: null, onStat: null,
    // Must be called right inside the tap, before any waiting: the iPhone lets a page make sound only from a tap.
    // The first tap on «Мужской» was silent because the sound was switched on after the voice had loaded (Owner, 2026-11-17).
    // «playback» also lets the story sound when the iPhone's side switch is on silent, like the phone voice.
    unlock() {
      try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {}
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      try { AC.resume(); const s = AC.createBufferSource(); s.buffer = AC.createBuffer(1, 1, 22050); s.connect(AC.destination); s.start(0); } catch (e) {}
    },
    async play(list, from, lang, voiceId, speed) {
      R.stop(); const my = ++token; R.on = true; R.i = from;
      R.unlock(); try { await AC.resume(); } catch (e) {}
      let when = AC.currentTime + 0.05, first = true;
      for (let k = from; k < list.length && my === token; k++) {
        const a = performance.now(); const w = await synth(list[k], lang, voiceId, TTS.steps, speed); if (my !== token) return;
        R.made += performance.now() - a; R.sound += w.length / TTS.sr;
        if (TTS.steps > 6 && R.made / 1000 > R.sound * 0.85) TTS.steps = 6; // slow phone: a little lighter, never the robotic 4 steps (Owner 2026-11-17)
        const buf = AC.createBuffer(1, w.length, TTS.sr); buf.copyToChannel(w, 0);
        const s = AC.createBufferSource(); s.buffer = buf; s.connect(AC.destination);
        when = Math.max(when, AC.currentTime + 0.02); s.start(when);
        const idx = k; s.onended = () => { if (my !== token) return; R.i = idx + 1; R.onPiece && R.onPiece(idx + 1, list.length); if (idx + 1 >= list.length) { R.on = false; R.onEnd && R.onEnd(); } };
        srcs.push(s); when += buf.duration + 0.22;
        if (first) { first = false; R.onStat && R.onStat(); }
        while (my === token && when - AC.currentTime > 20) await new Promise((r) => setTimeout(r, 300));
      }
    },
    stop() { token++; R.on = false; srcs.forEach((s) => { try { s.onended = null; s.stop(); } catch (e) {} }); srcs = []; },
  };
  return R;
}

// Inside the background thread: load and make phrases on request from the page.
if (IN_WORKER) self.onmessage = async (e) => {
  const { id, op, args } = e.data;
  try {
    if (op === "load") { const T = await loadHere(args.how, (t) => self.postMessage({ id, say: t })); self.postMessage({ id, r: { sr: T.sr, steps: T.steps, gpu: T.gpu, secs: T.secs } }); }
    else if (op === "synth") { const w = await synth(...args); self.postMessage({ id, r: w, last: { ...LAST } }, [w.buffer]); }
  } catch (err) { self.postMessage({ id, err: String((err && err.message) || err) }); }
};
