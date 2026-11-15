// The Earth Information Jukebox — нова сторінка (дизайн команди з архіву + наш рушій).
// Дані: /api/videos, /api/score/<id> (партитура + keyframes з метриками), /api/features/<id> (дати).
// Звук: ScorePlayer (../player.js). Вигляд: ./ui.js (UI). Тут лише правила гри й керування.
import { ScorePlayer } from "../player.js";
import { UI } from "./ui.js";

const $ = (id) => document.getElementById(id);
const video = $("video");
const view = $("view");
const ctx2d = view.getContext("2d");

const NAMES = {
  ndvi_world: "Весь світ", ndvi_north_america: "Північна Америка", ndvi_south_america: "Південна Америка",
  ndvi_eurasia: "Євразія", ndvi_africa: "Африка", ndvi_australia: "Австралія",
};
const MONTH_EN = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const NOM = ["січень", "лютий", "березень", "квітень", "травень", "червень", "липень", "серпень", "вересень", "жовтень", "листопад", "грудень"];
const GEN = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];
const SHORT = ["січ", "лют", "бер", "квіт", "трав", "черв", "лип", "серп", "вер", "жовт", "лист", "груд"];

/** «Jan 2024» → { nom: "січень 2024", gen: "січня 2024" } */
function uk(label) {
  const [m, y] = label.split(" ");
  const i = MONTH_EN[m];
  return i === undefined ? { nom: label, gen: label } : { nom: `${NOM[i]} ${y}`, gen: `${GEN[i]} ${y}` };
}

// Групи мікшера → id шарів і голосів у партитурі
const TRACKS = {
  wind: ["air_winter", "air_warm", "air_dry"],
  chimes: ["chimes"],
  birds: ["birds"],
  music: ["wind", "pad", "drone_D", "drone_F", "drips", "wood"],
};
const SEGMENT_SECONDS = 6;   // скільки реальних секунд звучить відкритий відрізок
const YEAR_SECONDS = 3;      // скільки звучить один період («Прослухати»)
const MIN_CHANGE = 0.15;     // зміна < 15% діапазону регіону → «тиха ділянка» без питання (на слух не розрізнити)

let videos = [];
let current = null;          // id регіону
let player = null, score = null, features = null, crop = null;
let loadToken = 0;
let uiReady = false;
let fixedT = null;           // коли не null, звук «заморожено» на цьому часі (прослуховування періоду)
let run = 0;                 // id поточного відтворення (новий скасовує попередній)
const mix = {};              // track → гучність 0..1 з мікшера
let game = null;
let globe = null;            // 3D-глобус (globe.js), якщо WebGL доступний
let guideRun = 0;            // id автосупроводу (новий скасовує попередній)
let earSynth = null;

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

// ======================= Відео на canvas: регіон, вписаний у екран =======================
function drawFrame() {
  const r = view.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
  if (view.width !== W || view.height !== H) { view.width = W; view.height = H; }
  if (video.readyState < 2) return;
  const [sx, sy, sw, sh] = crop || [0, 0, video.videoWidth, video.videoHeight];
  const k = Math.min(W / sw, H / sh);                      // вписати весь регіон (contain)
  const dw = sw * k, dh = sh * k;
  ctx2d.fillStyle = "#091211";
  ctx2d.fillRect(0, 0, W, H);
  ctx2d.drawImage(video, sx, sy, sw, sh, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

function dateAt(t) {
  const tl = features?.timeline;
  if (!tl) return "";
  const d = new Date(tl.start);
  d.setDate(d.getDate() + Math.round(t * tl.days_per_second));
  return `${d.getDate()} ${SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

let needDraw = true;
["seeked", "loadeddata", "play"].forEach((ev) => video.addEventListener(ev, () => (needDraw = true)));
addEventListener("resize", () => (needDraw = true));
(function loop() {
  // перемальовуємо відео лише коли воно грає або змінився кадр (на паузі — нічого не робимо)
  if (needDraw || !video.paused) { drawFrame(); needDraw = video.readyState < 2; }
  if (features) $("map-tag").textContent = `NASA · NDVI · ${dateAt(fixedT ?? video.currentTime)}`;
  requestAnimationFrame(loop);
})();

// ======================= Звук =======================
async function ensureAudio() {
  await Tone.start(); // браузер дозволяє звук лише після дії користувача
  if (player && !player.timer) { player.start(); player.pause(); }
}

function applyMix() {
  if (!player) return;
  for (const [track, ids] of Object.entries(TRACKS)) player.setVolume(ids, mix[track] ?? 1);
}

function stopPlayback() {
  run++;
  video.pause();
  player?.pause();
  fixedT = null;
}

/** Відео + звук від кадру a до кадру b за `seconds` реальних секунд. Promise завершується в кінці або при скасуванні. */
async function playSegment(ka, kb, seconds) {
  stopPlayback();
  const my = run;
  await ensureAudio();
  if (my !== run) return;
  video.currentTime = ka.t;
  video.playbackRate = Math.max((kb.t - ka.t) / seconds, 0.0625);
  player.resume();
  await video.play().catch(() => {});
  await new Promise((resolve) => {
    const watch = () => {
      if (my !== run) return resolve();
      if (video.currentTime >= kb.t || video.ended) { video.pause(); player.pause(); return resolve(); }
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  });
}

/** Звук одного періоду: час «заморожено» на ключовому кадрі */
async function playPeriod(i) {
  stopPlayback();
  const my = run;
  await ensureAudio();
  if (my !== run) return;
  const kf = score.keyframes[i];
  fixedT = kf.t;
  video.currentTime = kf.t;
  player.resume();
  UI.setPlaying(i, true);
  await new Promise((r) => setTimeout(r, YEAR_SECONDS * 1000));
  UI.setPlaying(i, false);
  if (my === run) { player.pause(); fixedT = null; }
}

// ======================= Гра: питання з даних =======================
function buildGame() {
  const kf = score.keyframes;
  const all = features.frames;
  const range = (k) => { const v = all.map((f) => f[k]); return Math.max(...v) - Math.min(...v); };
  const gR = range("green_frac") || 1, wR = range("white_frac");
  const hasSnow = Math.max(...all.map((f) => f.white_frac)) > 0.05;
  const segs = [];
  for (let a = 0; a + 1 < kf.length; a++) {
    const b = a + 1, A = kf[a].metrics, B = kf[b].metrics;
    const dg = (B.green_frac - A.green_frac) / gR;
    const dw = hasSnow ? (B.white_frac - A.white_frac) / (wR || 1) : 0;
    const seg = { a, b };
    if (Math.max(Math.abs(dg), Math.abs(dw)) < MIN_CHANGE) { seg.calm = true; segs.push(seg); continue; }
    const snow = Math.abs(dw) > Math.abs(dg);
    const more = a % 2 === 0;           // чергуємо «більше / менше» для різноманітності
    const key = snow ? "white_frac" : "green_frac";
    seg.text = snow
      ? (more ? "Де віє хуртовина — у якому періоді більше снігу?" : "Де сніг уже розтанув?")
      : (more ? "У якому періоді більше зелені?" : "Коли природа «спить» — де менше зелені?");
    seg.hint = snow ? "Хуртовина виє = багато снігу." : "Більше дзвіночків і птахів = більше зелені.";
    const va = A[key], vb = B[key];
    seg.correct = more ? (va >= vb ? a : b) : (va <= vb ? a : b);
    segs.push(seg);
  }
  return { segs, i: 0, errors: 0, firstTry: 0, asked: 0, busy: false, finished: false, started: false, keysTold: false };
}

/** Скасувати автосупровід (голос + відтворення), напр. коли людина відповіла раніше */
function cancelGuide() {
  guideRun++;
  UI.stopSpeak();
  stopPlayback();
}

/** Автопрослуховування для незрячих: гра сама озвучує питання, грає обидва періоди й чекає «1» або «2».
 *  Руками потрібна лише одна клавіша на відповідь. */
async function guide(seg) {
  const my = ++guideRun;
  const kf = score.keyframes, A = uk(kf[seg.a].label), B = uk(kf[seg.b].label);
  const alive = () => my === guideRun && game && !game.busy;
  await UI.speak(`Ділянка з ${A.gen} по ${B.nom}. ${seg.calm ? "Тиха ділянка, майже без змін." : seg.text}`);
  if (!alive()) return;
  if (seg.calm) { await UI.speak("Натисніть пробіл, щоб послухати."); return; }
  await UI.speak(`Перший: ${A.nom}.`); if (!alive()) return;
  await playPeriod(seg.a); if (!alive()) return;
  await UI.speak(`Другий: ${B.nom}.`); if (!alive()) return;
  await playPeriod(seg.b); if (!alive()) return;
  await UI.speak(game.keysTold ? "Один чи два?" : "Натисніть 1, якщо перший, або 2, якщо другий. R — послухати ще раз, пробіл — ехо.");
  game.keysTold = true;
}

/** Короткі звукові сигнали (earcons) + вібрація на телефоні: результат чути й відчути без екрана */
function earcon(kind) {
  try {
    if (!earSynth) {
      earSynth = new Tone.Synth({ oscillator: { type: "sine" }, envelope: { attack: 0.005, decay: 0.25, sustain: 0, release: 0.2 } }).toDestination();
      earSynth.volume.value = -8;
    }
    const now = Tone.now();
    if (kind === "ok") { earSynth.triggerAttackRelease("A5", 0.12, now); earSynth.triggerAttackRelease("E6", 0.2, now + 0.13); }
    else earSynth.triggerAttackRelease("D3", 0.35, now);
    navigator.vibrate?.(kind === "ok" ? [40, 60, 40] : [180]);
  } catch { /* звук необов'язковий */ }
}

/** Опис періоду для «Екскурсії без рук»: що видно й що чути */
function describe(k) {
  const m = k.metrics, L = score.legend || {};
  const nm = (v, r) => (r ? Math.min(1, Math.max(0, (v - r[0]) / (r[1] - r[0]))) : 0);
  const date = uk(k.label).nom, green = Math.round(m.green_frac * 100), snow = m.white_frac > 0.05;
  if (nm(m.white_frac, L.winter_range) > 0.5) return `${date}. Зима: сніг укриває ${Math.round(m.white_frac * 100)} відсотків суші, чути хуртовину.`;
  if (nm(m.green_up_rate, L.spring_range) > 0.3) return `${date}. Зелень росте${snow ? ", сніг тане: чути капель" : ""}. Дзвіночків більшає, мелодія йде вгору. Зелені ${green} відсотків.`;
  if (nm(m.green_up_rate, L.autumn_range) > 0.3) return `${date}. Зелень спадає: сухий вітер, дерев'яні клацання, мелодія йде вниз. Зелені ${green} відсотків.`;
  return `${date}. Пора буйної зелені: птахи й багато дзвіночків. Зелені ${green} відсотків.`;
}

/** «Екскурсія без рук»: усі періоди по черзі з описом голосом, без питань */
async function tour() {
  cancelGuide();
  const my = guideRun;
  const kf = score.keyframes;
  UI.hideMessage(); UI.hideQuestion(); UI.showBell(false); UI.showHint("");
  await UI.speak(`Екскурсія без рук: ${NAMES[current] || ""}. Просто слухайте. Escape — зупинити.`);
  for (let i = 0; i + 1 < kf.length && my === guideRun; i++) {
    UI.showPair(i, i + 1);
    UI.unlockScreen(describe(kf[i]));
    UI.announce(describe(kf[i]));
    await UI.speak(describe(kf[i]));
    if (my !== guideRun) break;
    await playSegment(kf[i], kf[i + 1], SEGMENT_SECONDS);
  }
  UI.lockScreen();
  if (my !== guideRun) return;
  await UI.speak("Екскурсію завершено.");
  if (!game.started) showStart();
  else if (game.finished) finish();
  else askPair();
}

function askPair() {
  const g = game, seg = g.segs[g.i], kf = score.keyframes;
  const A = uk(kf[seg.a].label), B = uk(kf[seg.b].label);
  UI.showHint("");
  UI.showPair(seg.a, seg.b);
  UI.showBell(true);
  UI.setScore(`Відрізок ${g.i + 1} з ${g.segs.length}`);
  if (seg.calm) UI.showQuestion(`${A.nom} → ${B.nom}: тиха ділянка, майже без змін. Натисніть 🔔 Ехо, щоб послухати.`);
  else UI.showQuestion(`${seg.text} (${A.nom} чи ${B.nom})`);
  UI.announce(`Ділянка з ${A.gen} по ${B.nom}. ${seg.calm ? "Тиха ділянка." : seg.text}`);
  guide(seg);
}

async function unlock(withBell) {
  const g = game, seg = g.segs[g.i], kf = score.keyframes;
  g.busy = true;
  UI.link(seg.a, seg.b);
  if (withBell) { UI.ringBell(); await new Promise((r) => setTimeout(r, 900)); }
  UI.unlockScreen(`${uk(kf[seg.a].label).nom} → ${uk(kf[seg.b].label).nom}`);
  await playSegment(kf[seg.a], kf[seg.b], SEGMENT_SECONDS);
  UI.lockScreen();
  g.busy = false; g.errors = 0; g.i += 1;
  if (g.i >= g.segs.length) finish(); else askPair();
}

function finish() {
  const g = game;
  g.finished = true;
  UI.hideQuestion();
  UI.showBell(false);
  const msg = g.asked ? `З першої спроби: ${g.firstTry} з ${g.asked}` : "";
  UI.setScore(msg);
  UI.showMessage("Нейронну мережу збудовано!", "▶ Слухати весь період", playAll);
  UI.announce(`Нейронну мережу збудовано. ${msg}. Можна прослухати весь період.`);
  UI.speak("Нейронну мережу збудовано.");
}

async function playAll() {
  UI.hideMessage();
  const kf = score.keyframes, first = kf[0], last = kf[kf.length - 1];
  UI.unlockScreen(`Увесь період: ${uk(first.label).nom} → ${uk(last.label).nom}`);
  await playSegment({ t: 0 }, { t: features.duration_s - 0.05 }, features.duration_s / (score.playback_rate || 0.25));
  UI.showMessage("Нейронну мережу збудовано!", "▶ Слухати ще раз", playAll);
}

const handlers = {
  onPick(i) {
    const g = game;
    if (!g || g.busy || g.finished) return;
    const seg = g.segs[g.i];
    if (seg.calm) return handlers.onBell();
    cancelGuide();
    if (g.errors === 0) g.asked += 1;
    if (i === seg.correct) {
      if (g.errors === 0) g.firstTry += 1;
      earcon("ok");
      UI.announce("Так! Відрізок відкрито.");
      UI.speak("Так!");
      unlock(false);
    } else {
      UI.wrong(i);
      earcon("no");
      g.errors += 1;
      const extra = g.errors >= 2 ? " Або натисніть пробіл, щоб відкрити відрізок без відповіді." : "";
      UI.showHint(`${seg.hint}${extra}`);
      UI.announce(`Ні. ${seg.hint}${extra}`);
      UI.speak(`Ні. ${seg.hint} R — послухати ще раз.${extra}`);
    }
  },
  onListen(i) {
    if (game?.busy) return;
    cancelGuide();
    playPeriod(i);
  },
  onBell() {
    const g = game;
    if (!g || g.busy) return;
    cancelGuide();
    if (g.finished) return playAll();
    unlock(true);
  },
  onTrack(track, vol, enabled) {
    mix[track] = enabled ? vol : 0;
    applyMix();
  },
};

// ======================= Регіони =======================
async function loadRegion(id) {
  const v = videos.find((x) => x.id === id) || videos.find((x) => x.id === "ndvi_north_america") || videos[0];
  const token = ++loadToken;
  stopPlayback();
  $("region-select").value = v.id;
  document.title = `${NAMES[v.id] || v.title} · The Earth Information Jukebox`;
  crop = v.crop || null;
  const src = v.has_local_video ? `/media/${v.local_video}` : v.video_url;
  if (src && !video.src.endsWith(src)) video.src = src;

  const [s, f] = await Promise.all([getJSON(`/api/score/${v.id}`), getJSON(`/api/features/${v.id}`)]);
  const p = new ScorePlayer(s, { getTime: () => fixedT ?? video.currentTime, getRate: () => video.playbackRate });
  await p.load();
  if (token !== loadToken) return p.dispose();   // за цей час обрали інший регіон
  player?.dispose();
  player = p; score = s; features = f;
  applyMix();

  const labels = s.keyframes.map((k) => uk(k.label).nom);
  if (!uiReady) { UI.init(labels, handlers); uiReady = true; } else UI.setNodes(labels);
  game = buildGame();
  current = v.id;
  UI.lockScreen();
  UI.setCaption("");
  focusGlobe(v);
  showStart();
}

const KEYS_HELP = "Enter — почати. 1 і 2 — відповідь, R — послухати ще раз, пробіл — ехо, T — екскурсія без рук, Escape — тиша.";

function showStart() {
  UI.showMessage(`${NAMES[current] || ""}: зміни Землі — у звуці`, "Почати", async () => {
    await ensureAudio();
    UI.hideMessage();
    game.started = true;
    askPair();
  });
  UI.announce(`${NAMES[current] || ""}. ${KEYS_HELP}`);
}

/** Повернути 3D-глобус до центру регіону (центр crop у рівнопроміжній проекції 4096×2048) */
function focusGlobe(v) {
  if (!globe || !v?.crop) return;
  const [x, y, w, h] = v.crop;
  globe.setFocus(((x + w / 2) / 4096) * 360 - 180, 90 - ((y + h / 2) / 2048) * 180);
}

// Клавіатура — гра повністю без миші. Літери за фізичними клавішами (e.code), тож працює й в українській розкладці.
window.addEventListener("keydown", (e) => {
  const inApp = !$("game-shell").classList.contains("intro-mode");
  if (!inApp || !game || e.target.closest("input, select, textarea")) return;
  const overlay = !$("screen-overlay").classList.contains("hidden");
  const seg = game.segs[game.i];
  if (e.code === "Escape") { cancelGuide(); return; }
  if (e.code === "KeyT") { e.preventDefault(); tour(); return; }
  if (overlay) {
    if (e.code === "Enter" && !e.target.closest("button")) { e.preventDefault(); $("overlay-btn").click(); }
    return;
  }
  if (e.code === "Space") {
    if (e.target.closest("button, summary")) return;
    e.preventDefault();
    if (!game.finished) handlers.onBell();
    return;
  }
  if (game.finished || game.busy || !seg) return;
  if (["Digit1", "Numpad1", "ArrowLeft"].includes(e.code)) { e.preventDefault(); handlers.onPick(seg.a); }
  if (["Digit2", "Numpad2", "ArrowRight"].includes(e.code)) { e.preventDefault(); handlers.onPick(seg.b); }
  if (e.code === "KeyR") { e.preventDefault(); cancelGuide(); guide(seg); }
});

// «Пропустити вступ»: одразу до гри; кнопка ховається, коли вступ пройдено
$("skip-intro").onclick = () => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
addEventListener("scroll", () => {
  const atEnd = scrollY >= document.documentElement.scrollHeight - innerHeight - 4;
  $("skip-intro").classList.toggle("gone", atEnd);
}, { passive: true });

(async function init() {
  videos = await getJSON("/api/videos");
  const sel = $("region-select");
  sel.innerHTML = videos.map((v) => `<option value="${v.id}">${NAMES[v.id] || v.title}</option>`).join("");
  sel.onchange = () => (location.hash = sel.value);
  addEventListener("hashchange", () => loadRegion(location.hash.slice(1)));
  $("tour-btn").onclick = () => tour();
  // 3D-глобус: окремий модуль з CDN; якщо не завантажиться — лишається 2D-текстура
  import("./globe.js")
    .then((m) => { globe = m.createGlobe($("earth-orb"), "/static/img/earth_ndvi.jpg"); focusGlobe(videos.find((x) => x.id === current)); })
    .catch(() => {});
  await loadRegion(location.hash.slice(1));
})().catch((e) => document.body.insertAdjacentHTML("afterbegin", `<p style="position:fixed;z-index:99;color:#f88;padding:16px">Помилка: ${e.message}</p>`));
