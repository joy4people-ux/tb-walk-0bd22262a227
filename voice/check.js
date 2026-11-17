// «Проверка голоса» (2026-11-17): step-by-step test of the offline voice on the Owner's iPhone, after two failed map tests
// (silence, a short squeak, the page reset). Every step is written to the phone's memory BEFORE it starts, so if the
// phone resets the page, the next open shows on which step it happened. The Owner sends a screenshot of the record.
const $ = (id) => document.getElementById(id);
const KEY = "tb-voice-check", CPU = /force-cpu/.test(location.search);
let lines = [];
const t0 = performance.now();
function log(t, cls) {
  lines.push(t); try { sessionStorage.setItem(KEY + "-run", JSON.stringify(lines)); localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), lines })); } catch (e) {}
  const d = document.createElement("div"); d.textContent = t; if (cls) d.className = cls; $("log").appendChild(d);
}
const mark = (step) => { try { localStorage.setItem(KEY + "-step", step); } catch (e) {} };
const done = () => { try { localStorage.removeItem(KEY + "-step"); } catch (e) {} };
window.addEventListener("error", (e) => log("ОШИБКА: " + e.message, "bad"));
window.addEventListener("unhandledrejection", (e) => log("ОШИБКА: " + (e.reason && (e.reason.message || e.reason)), "bad"));

// The previous run stopped in the middle of a step = the page was reset there.
try {
  const step = localStorage.getItem(KEY + "-step"), prev = JSON.parse(localStorage.getItem(KEY) || "null");
  if (step) { const p = $("prev"); p.hidden = false; p.innerHTML = "<b class='bad'>Прошлая проверка оборвалась — телефон перезагрузил страницу на шаге:</b>";
    p.append(step); if (prev) { const pre = document.createElement("div"); pre.id = "log"; pre.textContent = prev.lines.join("\n"); p.appendChild(pre); } done(); }
} catch (e) {}

const man = await (await fetch("model/manifest.json", { cache: "no-cache" })).json().catch(() => null);
const V = await import("./" + (man ? man.engine : "voice-engine.mjs"));
log("Версия голоса: " + (man ? man.engine : "?") + (CPU ? " · режим: процессор" : ""));
log("Телефон: " + navigator.userAgent.replace(/^Mozilla\/5\.0 /, ""));
try {
  if (!navigator.gpu) log("Видеочип для страниц (WebGPU): НЕТ", "bad");
  else { const ad = await navigator.gpu.requestAdapter(); if (!ad) log("Видеочип для страниц: не отвечает", "bad");
    else { const i = ad.info || {}; log("Видеочип: есть · " + [i.vendor, i.architecture, i.description].filter(Boolean).join(" ") +
      " · f16: " + (ad.features.has("shader-f16") ? "да" : "нет") + " · буфер до " + Math.round(ad.limits.maxBufferSize / 1e6) + " МБ · хранилище до " + Math.round(ad.limits.maxStorageBufferBindingSize / 1e6) + " МБ"); } }
} catch (e) { log("Видеочип: ошибка " + e.message, "bad"); }
try { const q = await navigator.storage.estimate(); log("Память браузера: занято " + Math.round(q.usage / 1e6) + " МБ из " + Math.round(q.quota / 1e6) + " МБ"); } catch (e) {}
let have = await V.isDownloaded(); if (!have && (await V.repair())) have = await V.isDownloaded(); /* after an engine update only the small engine files are fetched */ log(have ? "Голос в телефоне: да" : "Голос в телефоне: НЕТ — сначала «Скачать всё для поездки» на карте", have ? "ok" : "bad");
if (!have) { $("gpu").disabled = true; $("cpu").disabled = true; }
if (CPU) $("gpu").textContent = "Включить и сказать фразу (процессор)";

let AC = null;
function audio() { // inside the tap
  try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {}
  AC = AC || new (window.AudioContext || window.webkitAudioContext)(); try { AC.resume(); } catch (e) {}
  return AC;
}
$("beep").onclick = () => {
  const ac = audio(), o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = 523; g.gain.value = 0.25; o.connect(g); g.connect(ac.destination);
  o.start(); o.stop(ac.currentTime + 1);
  setTimeout(() => log("Гудок: звук " + ac.state + ", частота " + ac.sampleRate + " Гц, сессия " + (navigator.audioSession ? navigator.audioSession.type : "нет") + ". Слышно гудок? — напишите Алёше."), 300);
};
function stats(w, sr) {
  let peak = 0, sum = 0, bad = 0; for (let i = 0; i < w.length; i++) { const x = w[i]; if (!Number.isFinite(x)) { bad++; continue; } const a = Math.abs(x); if (a > peak) peak = a; sum += x * x; }
  const rms = Math.sqrt(sum / Math.max(1, w.length - bad));
  return { txt: "длина " + (w.length / sr).toFixed(1) + " с · громкость пик " + peak.toFixed(2) + ", средняя " + rms.toFixed(3) + (bad ? " · ИСПОРЧЕНО точек: " + bad : ""), ok: !bad && rms > 0.01 && peak < 1.01 && w.length > sr * 0.5 };
}
$("gpu").onclick = async () => {
  const ac = audio(); $("gpu").disabled = true;
  try {
    if (!V.engine()) { mark("включение голоса" + (CPU ? " (процессор)" : ""));
      const a = performance.now(); await V.load((s) => { mark(s + (CPU ? " (процессор)" : "")); log(s); });
      log("Голос включён за " + ((performance.now() - a) / 1000).toFixed(1) + " с · " + (V.engine().gpu ? "видеочип" : "процессор"), "ok"); }
    const text = "Здравствуйте! Это проверка голоса без интернета.";
    for (const [steps, label] of [[8, "обычный"], [4, "облегчённый"]]) {
      mark("фраза, режим " + label); const a = performance.now(); const w = await V.synth(text, "ru", "M2", steps, 1);
      const s = stats(w, V.engine().sr); s.txt += " · до защиты: пик " + V.LAST.peak.toFixed(2) + (V.LAST.bad ? ", ИСПОРЧЕНО точек " + V.LAST.bad : ""); if (V.LAST.bad) s.ok = false; log("Фраза (" + label + "): сделана за " + ((performance.now() - a) / 1000).toFixed(1) + " с · " + s.txt, s.ok ? "ok" : "bad");
      if (steps === 8) { mark("воспроизведение фразы"); const b = ac.createBuffer(1, w.length, V.engine().sr); b.copyToChannel(w.map((x) => (Number.isFinite(x) ? x : 0)), 0);
        const src = ac.createBufferSource(); src.buffer = b; src.connect(ac.destination); src.start(); log("Играю фразу (звук " + ac.state + "). Слышно? Как звучит? — напишите Алёше."); await new Promise((r) => setTimeout(r, b.duration * 1000 + 300)); }
    }
    done(); log("Проверка закончена.", "ok");
  } catch (e) { done(); log("ОШИБКА: " + (e && e.message ? e.message : e), "bad"); }
  $("gpu").disabled = false;
};
$("cpu").onclick = () => { done(); sessionStorage.removeItem(KEY + "-run"); location.href = "check.html?force-cpu&" + Date.now(); };
log("Готово к проверке (" + ((performance.now() - t0) / 1000).toFixed(1) + " с).");
