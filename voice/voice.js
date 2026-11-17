// «Голос без интернета» — test page for the shared offline voice engine (voice-engine.mjs), Owner 2026-11-16.
import * as V from "./voice-engine.mjs";

const $ = (id) => document.getElementById(id);
const S = { lang: "ru", voice: "M1", speed: 1.0 };
try { Object.assign(S, JSON.parse(localStorage.getItem("tb-offline-voice") || "{}")); } catch (e) {}
const save = () => { try { localStorage.setItem("tb-offline-voice", JSON.stringify(S)); } catch (e) {} };
const TEXTS = window.TEXTS; const R = V.reader();

function drawPicks() {
  document.querySelectorAll("[data-voice]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.voice === S.voice)));
  document.querySelectorAll("[data-lang]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === S.lang)));
  $("rate").textContent = "×" + S.speed.toFixed(1).replace(".", ",");
  $("story").textContent = TEXTS[S.lang].text; $("stitle").textContent = TEXTS[S.lang].title;
}
function stat() { const T = V.engine(); $("stat").textContent = `Голос рождается в ${(R.sound / (R.made / 1000)).toFixed(1)} раза быстрее, чем звучит · ${T.gpu ? "видеокарта" : "процессор"}${T.steps === 4 ? " · облегчённый режим" : ""}`; }
async function ready() {
  $("dl").hidden = true; $("player").hidden = false; $("state").textContent = "Голос в телефоне ✓ — работает и без интернета";
  $("play").disabled = true; const T = await V.load((t) => ($("stat").textContent = t));
  $("stat").textContent = `Голос включён за ${T.secs} с (${T.gpu ? "видеокарта" : "процессор"}). Нажмите «Слушать».`; $("play").disabled = false;
}
function play(text) {
  const t0 = performance.now(); $("play").textContent = "Стоп"; R.made = 0; R.sound = 0;
  R.onStat = () => { stat(); $("stat").textContent = "Первый звук через " + ((performance.now() - t0) / 1000).toFixed(1) + " с · " + $("stat").textContent; };
  R.onPiece = () => { const keep = $("stat").textContent.split(" · ")[0]; stat(); if (/Первый/.test(keep)) $("stat").textContent = keep + " · " + $("stat").textContent; };
  R.onEnd = () => ($("play").textContent = "▶ Слушать");
  R.play(V.pieces(text, S.lang), 0, S.lang, S.voice, S.speed).catch((e) => { R.stop(); $("play").textContent = "▶ Слушать"; $("stat").textContent = "Ошибка: " + e.message; });
}
async function init() {
  drawPicks();
  const m = await V.manifest(); if (!m) { $("state").textContent = "Нет связи, а голос ещё не скачан."; return; }
  $("size").textContent = Math.round((await V.totalBytes()) / 1e6);
  if (!(await V.canRun())) $("state").textContent = "Внимание: этот телефон, похоже, не потянет голос (нет WebGPU). Попробовать можно.";
  if (await V.isDownloaded()) await ready(); else { $("dl").hidden = false; if (!/Внимание/.test($("state").textContent)) $("state").textContent = "Голос ещё не скачан"; }
}
$("get").onclick = async () => {
  $("get").disabled = true; $("prog").hidden = false; const total = await V.totalBytes(); let done = 0;
  try { await V.download((n) => { done += n; $("bar").value = (done / total) * 100; $("dlt").textContent = Math.round(done / 1e6) + " из " + Math.round(total / 1e6) + " МБ"; }); await ready(); }
  catch (e) { $("dlt").textContent = "Загрузка прервалась (" + e.message + "). Нажмите ещё раз — продолжит с того же места."; $("get").disabled = false; }
};
$("play").onclick = () => { if (R.on) { R.stop(); $("play").textContent = "▶ Слушать"; } else play(TEXTS[S.lang].title + ". " + TEXTS[S.lang].text); };
document.querySelectorAll("[data-voice]").forEach((b) => (b.onclick = () => { S.voice = b.dataset.voice; save(); drawPicks(); if (V.engine()) play(TEXTS[S.lang].sample); }));
document.querySelectorAll("[data-lang]").forEach((b) => (b.onclick = () => { S.lang = b.dataset.lang; save(); R.stop(); $("play").textContent = "▶ Слушать"; drawPicks(); }));
$("slow").onclick = () => { S.speed = Math.max(0.7, Math.round((S.speed - 0.1) * 10) / 10); save(); drawPicks(); };
$("fast").onclick = () => { S.speed = Math.min(1.5, Math.round((S.speed + 0.1) * 10) / 10); save(); drawPicks(); };
$("wipe").onclick = async () => { if (!confirm("Удалить голос из телефона? Потом его можно скачать снова.")) return; R.stop(); await caches.delete(V.CACHE); location.reload(); };
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
window.__voiceTest = V; // for checks on the PC
init();
