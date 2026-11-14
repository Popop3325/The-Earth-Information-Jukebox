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
let player = null, score = null, features = null, crop = null;
let loadToken = 0;
let uiReady = false;
let fixedT = null;           // коли не null, звук «заморожено» на цьому часі (прослуховування періоду)
let run = 0;                 // id поточного відтворення (новий скасовує попередній)
const mix = {};              // track → гучність 0..1 з мікшера
let game = null;

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

(function loop() {
  drawFrame();
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
  return { segs, i: 0, errors: 0, firstTry: 0, asked: 0, busy: false, finished: false };
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
  const say = `Ділянка з ${A.gen} по ${B.nom}.`;
  UI.announce(`${say} ${seg.calm ? "Тиха ділянка." : seg.text}`);
  UI.speak(say);
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
    if (g.errors === 0) g.asked += 1;
    if (i === seg.correct) {
      if (g.errors === 0) g.firstTry += 1;
      UI.announce("Так! Відрізок відкрито.");
      unlock(false);
    } else {
      UI.wrong(i);
      g.errors += 1;
      UI.announce("Ні. Послухайте обидва періоди ще раз.");
      UI.showHint(g.errors >= 2 ? `${seg.hint} Або натисніть 🔔 Ехо, щоб відкрити відрізок без відповіді.` : seg.hint);
    }
  },
  onListen(i) {
    if (game?.busy) return;
    playPeriod(i);
  },
  onBell() {
    const g = game;
    if (!g || g.busy) return;
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
  UI.lockScreen();
  UI.setCaption("");
  UI.showMessage(`${NAMES[v.id] || v.title}: зміни Землі — у звуці`, "Почати", async () => {
    await ensureAudio();
    UI.hideMessage();
    askPair();
  });
}

// Клавіатура: пробіл = Ехо, але лише коли вступ пройдено (інакше пробіл прокручує сторінку)
window.addEventListener("keydown", (e) => {
  const inApp = !$("game-shell").classList.contains("intro-mode");
  if (!inApp || e.code !== "Space" || e.target.closest("input, select, textarea, button, summary")) return;
  e.preventDefault();
  if (game && !game.finished && $("screen-overlay").classList.contains("hidden")) handlers.onBell();
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
  await loadRegion(location.hash.slice(1));
})().catch((e) => document.body.insertAdjacentHTML("afterbegin", `<p style="position:fixed;z-index:99;color:#f88;padding:16px">Помилка: ${e.message}</p>`));
