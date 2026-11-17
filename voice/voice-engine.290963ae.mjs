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
let MANIFEST = null, TTS = null; const STYLE = {};

export async function manifest() {
  if (MANIFEST) return MANIFEST;
  const url = abs("model/manifest.json"); const c = await caches.open(CACHE);
  try { const r = await fetch(url, { cache: "no-cache" }); if (r.ok) { MANIFEST = await r.clone().json(); await c.put(url, r); return MANIFEST; } } catch (e) {}
  const h = await c.match(url); MANIFEST = h ? await h.json() : null; return MANIFEST;
}
// The phone can make the voice fast enough only with its graphics chip (WebGPU); without it the phone's own voice stays.
export async function canRun() {
  if (/force-cpu/.test(location.search)) return "cpu";
  try { if (navigator.gpu && (await navigator.gpu.requestAdapter())) return "gpu"; } catch (e) {}
  return "";
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
  const bufs = []; for (const p of f.parts) bufs.push(new Uint8Array(await cachedFetch(abs(p))));
  if (bufs.length === 1) return bufs[0];
  const out = new Uint8Array(f.size); let o = 0; for (const b of bufs) { out.set(b, o); o += b.length; } return out;
}
const readJson = async (name) => JSON.parse(new TextDecoder().decode(await readFile(name)));

export function engine() { return TTS; }
export async function load(say) {
  if (TTS) return TTS;
  const t0 = performance.now(); const how = await canRun();
  let eps = how === "gpu" ? ["webgpu", "wasm"] : ["wasm"];
  const cfg = await readJson("tts.json"), indexer = await readJson("unicode_indexer.json");
  const ses = []; const names = ["duration_predictor.onnx", "text_encoder.onnx", "vector_estimator.onnx", "vocoder.onnx"];
  for (let i = 0; i < names.length; i++) {
    say && say("Включаю голос… " + (i + 1) + " из 4");
    const bytes = await readFile(names[i]);
    try { ses.push(await ort.InferenceSession.create(bytes, { executionProviders: eps, graphOptimizationLevel: "all" })); }
    catch (e) { if (eps[0] !== "webgpu") throw e; eps = ["wasm"]; ses.push(await ort.InferenceSession.create(bytes, { executionProviders: eps })); }
  }
  TTS = { cfg, indexer, dp: ses[0], enc: ses[1], est: ses[2], voc: ses[3], sr: cfg.ae.sample_rate, gpu: eps[0] === "webgpu", steps: 8, secs: ((performance.now() - t0) / 1000).toFixed(1) };
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
  const run = queue.then(() => synthNow(text, lang, voiceId, steps, speed));
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
  return Float32Array.from((await TTS.voc.run({ latent: new ort.Tensor("float32", x, [1, dim, len]) })).wav_tts.data.subarray(0, wavLen));
}
// Pieces for reading: the first one short (the sound starts sooner), the rest up to ~220 letters.
export function pieces(t, lang) {
  const max = lang === "ja" || lang === "ko" ? 100 : 220, out = [];
  (t.match(/[^.!?…]+[.!?…]+["»)]*\s*|[^.!?…]+$/g) || [t]).forEach((s) => { s = s.trim(); if (!s) return;
    if (out.length > 1 && out[out.length - 1].length + s.length < max) out[out.length - 1] += " " + s; else out.push(s); });
  return out;
}

// A reader that plays pieces one after another, making the next while the current one sounds.
export function reader() {
  let AC = null, srcs = [], token = 0;
  const R = { on: false, i: 0, made: 0, sound: 0, onPiece: null, onEnd: null, onStat: null,
    async play(list, from, lang, voiceId, speed) {
      R.stop(); const my = ++token; R.on = true; R.i = from;
      AC = AC || new (window.AudioContext || window.webkitAudioContext)(); try { await AC.resume(); } catch (e) {}
      let when = AC.currentTime + 0.05, first = true;
      for (let k = from; k < list.length && my === token; k++) {
        const a = performance.now(); const w = await synth(list[k], lang, voiceId, TTS.steps, speed); if (my !== token) return;
        R.made += performance.now() - a; R.sound += w.length / TTS.sr;
        if (TTS.steps > 4 && R.made / 1000 > R.sound * 0.8) TTS.steps = 4; // slow phone: lighter mode
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
