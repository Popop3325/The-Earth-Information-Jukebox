// The Earth Information Jukebox — сторінка гри (дизайн команди + наш рушій). Інтерфейс англійською.
// Дані: /api/videos, /api/score/<id> (партитура), /api/features/<id> (метрики кадрів + дати).
// Звук: ScorePlayer (../player.js). Вигляд: ./ui.js (UI). Тут лише правила гри й керування.
//
// Гра: 6 нейронів кожні 180 днів (Dec 2023 … Jun 2026) → 5 пар-інтервалів, по одному фіксованому питанню.
// Правильна відповідь або дзвіночок (пробіл) відкривають інтервал однаковою функцією openInterval().
import { ScorePlayer } from "../player.js";
import { UI } from "./ui.js";

const $ = (id) => document.getElementById(id);
const video = $("video");
const view = $("view");

// Лише регіони, де грудень і червень чутно різні (у південній півкулі й тропіках питання втрачають сенс)
const REGIONS = [
  ["ndvi_world", "Whole Earth"],
  ["ndvi_north_america", "North America"],
  ["ndvi_europe", "Europe"],
  ["ndvi_asia", "Asia"],
];
const NAMES = Object.fromEntries(REGIONS);
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Групи мікшера → id шарів і голосів у партитурі
const TRACKS = {
  wind: ["air_winter", "air_warm", "air_dry"],
  chimes: ["chimes"],
  birds: ["birds"],
  music: ["wind", "pad", "drone_D", "drone_F", "drips", "wood"],
};
const STEP_DAYS = 180;        // нейрон кожні 180 днів
const NEURONS = 6;
const MONTH_DAYS = 30;        // звук нейрона — його місяць (±15 днів)
const MONTH_SECONDS = 4;      // … звучить 4 с
const INTERVAL_SECONDS = 12;  // 180 днів інтервалу звучать 12 с
const BELL_PAUSE_MS = 1100;   // «природа слухає»

// Питання — у фіксованому порядку, по одному на інтервал. pick(A, B) → 0 (перший) або 1 (другий) за даними кадрів.
const lessGreen = (A, B) => (A.green <= B.green ? 0 : 1);
const moreGreen = (A, B) => (A.green >= B.green ? 0 : 1);
const QUESTIONS = [
  { text: "Where is nature asleep?", pick: lessGreen,
    hint: "Sleeping nature is quiet: few bells, no birds." },
  { text: "Where does the sound turn colder?",
    pick: (A, B) => (Math.abs(A.snow - B.snow) > 0.01 ? (A.snow >= B.snow ? 0 : 1) : lessGreen(A, B)),
    hint: "Cold sounds like a whistling winter wind." },
  { text: "Where do the birds have more to say?", pick: moreGreen,
    hint: "Birds sing where the land is green." },
  { text: "Where do the bells ring brighter?", pick: moreGreen,
    hint: "More green means more, brighter chimes." },
  { text: "Where is the land bare?", pick: lessGreen,
    hint: "Bare land sounds sparse and dry." },
];

let videos = [];
let current = null;          // id регіону
let player = null, score = null, features = null, crop = null;
let loadToken = 0;
let uiReady = false;
let run = 0;                 // id поточного відтворення (новий скасовує попередній)
const mix = {};              // track → гучність 0..1 з мікшера
let game = null;
let neurons = [];            // [{ t, day, short: "Dec 2023", full: "December 2023", green, snow }]
let globe = null;            // 3D-глобус (globe.js), якщо WebGL доступний
let earSynth = null, bowlVoices = null;
let listeningAll = false;
let playingNode = null;     // нейрон, чий місяць зараз звучить

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

// ======================= Відео: браузер показує сам <video>, обрізаний CSS-ом до регіону =======================
// Раніше кожен кадр 4096×2048 копіювався на canvas (drawImage) — це важко: на слабших машинах і в Safari
// відео «зависало», а звук (свій таймер) грав далі; до того ж canvas грубо масштабував кадр.
// Тепер: #view — вікно розміром з регіон (вписаний у екран), усередині — повне відео, зсунуте так,
// щоб у вікні був лише crop. Працює в усіх браузерах, декодування й масштабування — апаратні.
function layoutVideo() {
  const scr = $("screen"), box = { width: scr.offsetWidth, height: scr.offsetHeight };   // без CSS-transform «вступу»
  const VW = video.videoWidth || 4096, VH = video.videoHeight || 2048;
  const [sx, sy, sw, sh] = crop || [0, 0, VW, VH];
  const k = Math.min(box.width / sw, box.height / sh);   // вписати весь регіон (contain)
  Object.assign(view.style, {
    width: `${sw * k}px`, height: `${sh * k}px`,
    left: `${(box.width - sw * k) / 2}px`, top: `${(box.height - sh * k) / 2}px`,
  });
  Object.assign(video.style, {
    width: `${VW * k}px`, height: `${VH * k}px`, transform: `translate(${-sx * k}px, ${-sy * k}px)`,
  });
}
video.addEventListener("loadedmetadata", layoutVideo);
addEventListener("resize", layoutVideo);

function dateAt(t) {
  const tl = features?.timeline;
  if (!tl) return null;
  const d = new Date(tl.start + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + Math.round(t * tl.days_per_second));
  return d;
}
const fmtDay = (d) => (d ? `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}` : "");

(function loop() {
  if (features) $("map-tag").textContent = `NASA · NDVI · ${fmtDay(dateAt(video.currentTime))}`;
  requestAnimationFrame(loop);
})();

// ======================= Зорі на екрані з планетою =======================
// Два нерухомі шари дрібних тьмяних зір; CSS повільно «дихає» їхньою яскравістю в протифазі → ледь помітне мерехтіння.
// Детерміновано (власний генератор), перемальовується лише при зміні розміру вікна.
function drawStars() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  document.querySelectorAll(".starfield").forEach((c, layer) => {
    const W = innerWidth, H = innerHeight;
    c.width = W * dpr; c.height = H * dpr;
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    let seed = 7 + layer * 101;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const n = Math.round((W * H) / 9000);                 // ~110 зір на 1280×800 у кожному шарі
    for (let i = 0; i < n; i++) {
      const x = rnd() * W, y = rnd() * H, big = rnd() > 0.93;
      g.globalAlpha = big ? 0.6 + rnd() * 0.3 : 0.25 + rnd() * 0.3;
      g.fillStyle = rnd() > 0.8 ? "#cfe3ff" : "#ffffff";
      g.beginPath(); g.arc(x, y, big ? 1.3 : 0.7 + rnd() * 0.4, 0, Math.PI * 2); g.fill();
    }
  });
}
drawStars();
addEventListener("resize", drawStars);

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
  if (playingNode !== null) { UI.setPlaying(playingNode, false); playingNode = null; }
}

/** Відео + звук від часу a до b (с відео) за `seconds` реальних секунд. Promise завершується в кінці або при скасуванні. */
async function playSegment(a, b, seconds) {
  stopPlayback();
  const my = run;
  await ensureAudio();
  if (my !== run) return false;
  video.currentTime = a;
  video.playbackRate = Math.max((b - a) / seconds, 0.0625);
  player.resume();
  await video.play().catch(() => {});
  return new Promise((resolve) => {
    const watch = () => {
      if (my !== run) return resolve(false);
      if (video.currentTime >= b || video.ended) { video.pause(); player.pause(); return resolve(true); }
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  });
}

/** Звук нейрона: його місяць (±15 днів) */
async function playMonth(i) {
  const n = neurons[i], half = MONTH_DAYS / 2 / features.timeline.days_per_second;
  const a = Math.max(0, n.t - half), b = Math.min(features.duration_s - 0.05, n.t + half);
  const p = playSegment(a, b, MONTH_SECONDS);
  playingNode = i; UI.setPlaying(i, true);
  await p;
  if (playingNode === i) { UI.setPlaying(i, false); playingNode = null; }
}

/** Короткі сигнали (earcons) + вібрація на телефоні: результат чути й відчути без екрана */
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

/** Дзвіночок людини — «співоча чаша»: один чистий низький удар (G3) з довгим затуханням і негармонічними обертонами.
 *  Свідомо не схожий на численні високі дзвіночки соніфікації. */
function bowl() {
  try {
    if (!bowlVoices) {
      const rev = new Tone.Reverb({ decay: 6, wet: 0.35 }).toDestination();
      const voice = (vol, decay) => {
        const s = new Tone.Synth({ oscillator: { type: "sine" }, envelope: { attack: 0.004, decay, sustain: 0, release: 1.5 } }).connect(rev);
        s.volume.value = vol;
        return s;
      };
      bowlVoices = [voice(-5, 5), voice(-15, 3.5), voice(-23, 2)];
    }
    const now = Tone.now(), f = 196;
    [1, 2.71, 5.15].forEach((r, k) => bowlVoices[k].triggerAttackRelease(f * r, 0.05, now));
    navigator.vibrate?.([60]);
  } catch { /* звук необов'язковий */ }
}

// ======================= Гра =======================
function buildNeurons() {
  const tl = features.timeline, dps = tl.days_per_second;
  const lastDay = Math.floor((features.duration_s - 0.05) * dps);
  const days = Array.from({ length: NEURONS }, (_, i) => Math.min(i * STEP_DAYS, lastDay));
  return days.map((day) => {
    const t = day / dps, d = dateAt(t);
    const win = features.frames.filter((f) => Math.abs(f.t - t) <= MONTH_DAYS / 2 / dps);
    const avg = (k) => win.reduce((s, f) => s + f[k], 0) / (win.length || 1);
    return { t, day, short: `${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`,
      full: `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`, green: avg("green_frac"), snow: avg("white_frac") };
  });
}

function buildGame() {
  const pairs = QUESTIONS.slice(0, neurons.length - 1).map((q, i) => ({
    a: i, b: i + 1, q, correct: i + q.pick(neurons[i], neurons[i + 1]),
  }));
  return { pairs, i: 0, busy: false, skip: false, finished: false, last: null, firstTry: 0, errors: 0 };
}

const periodText = (p) => `${neurons[p.a].full} — ${neurons[p.b].full}`;

/** Показати стан поточної пари: питання ліворуч, дзвіночок, замкнене вікно */
function showPairState({ speakIt = false } = {}) {
  const g = game;
  if (listeningAll) return;            // «Listen to all» ще грає — стан пари покажемо після нього
  if (g.finished) return showFinished();
  const p = g.pairs[g.i];
  UI.lockScreen();
  UI.showPair(p.a, p.b);
  UI.showQuestion(p.q.text);
  UI.showBell(true);
  UI.showHint("");
  UI.setScore(`Pair ${g.i + 1} of ${g.pairs.length}`);
  pairMessage("Answer the question — or ring the bell 🔔 to open this period");
  const say = `Pair ${g.i + 1} of ${g.pairs.length}: ${periodText(p)}. ${p.q.text}`;
  UI.announce(`${say} Press Space to ring the bell.`);
  if (speakIt) UI.speak(say);
}

/** Текст у вікні відео (+ кнопка «Replay» попереднього інтервалу, якщо він є) */
function pairMessage(text) {
  if (game.last) UI.showMessage(text, `↻ Replay ${periodText(game.last)}`, replayLast);
  else UI.showMessage(text);
}

/** Відкрити інтервал: спільна дія для правильної відповіді й дзвіночка (перед дзвіночком — удар і пауза) */
async function openInterval(viaBell) {
  const g = game;
  if (!g || g.busy || g.finished) return;
  stopListeningAll();
  const p = g.pairs[g.i];
  g.busy = true; g.skip = false;
  stopPlayback(); UI.stopSpeak();
  UI.hideQuestion(); UI.showHint("");
  if (viaBell) {
    UI.ringBell(); bowl();
    await sleep(BELL_PAUSE_MS);                         // природа слухає
    if (!g.skip) await UI.speak(periodText(p));
  } else earcon("ok");
  UI.link(p.a, p.b);
  if (!g.skip) {
    UI.unlockScreen(periodText(p));
    UI.announce(`Opened: ${periodText(p)}.`);
    await playSegment(neurons[p.a].t, neurons[p.b].t, INTERVAL_SECONDS);
  }
  g.last = p; g.busy = false; g.errors = 0; g.i += 1;
  if (g.i >= g.pairs.length) { g.finished = true; showFinished(true); }
  else showPairState({ speakIt: true });
}

function replayLast() {
  const g = game;
  if (!g?.last || g.busy) return;
  UI.unlockScreen(periodText(g.last));
  playSegment(neurons[g.last.a].t, neurons[g.last.b].t, INTERVAL_SECONDS).then((done) => { if (done && !g.busy && !listeningAll) showPairState(); });
}

const STORY_OPEN = "The whole story is open. Press Enter to listen to the full sonification from 2023 to 2026.";
function showFinished(speakIt = false) {
  if (listeningAll) return;
  UI.lockScreen();
  UI.hideQuestion();
  UI.showPair(-1, -1);
  UI.setScore(game.firstTry ? `Answered: ${game.firstTry} of ${game.pairs.length}` : "");
  UI.showMessage("The whole story is open", "▶ Listen to 2023–2026  (Enter)", listenAll);
  UI.announce(STORY_OPEN);
  if (speakIt) UI.speak(STORY_OPEN);
}

/** «Listen to all»: повна соніфікація 2023–2026 разом із відео (для незрячих — основний режим) */
async function listenAll() {
  if (!features) return;
  if (listeningAll) return stopListeningAll(true);
  if (game?.busy) { game.skip = true; }
  UI.stopSpeak();
  listeningAll = true;
  setAllButton(true);
  UI.hideMessage(); UI.hideQuestion();
  const first = neurons[0], last = neurons[neurons.length - 1];
  UI.unlockScreen(`${first.full} — ${last.full}`);
  UI.announce(`Playing the full sonification, ${first.full} to ${last.full}. Press Escape to stop.`);
  const done = await playSegment(0, features.duration_s - 0.05, features.duration_s / (score.playback_rate || 0.25));
  if (done) stopListeningAll(true);
}
function stopListeningAll(restore = false) {
  if (!listeningAll) return;
  listeningAll = false;
  setAllButton(false);
  stopPlayback();
  if (restore && game && !game.busy) showPairState();
}
function setAllButton(on) {
  const b = $("listen-all");
  b.querySelector(".lbl").textContent = on ? "Stop" : "Listen to all";
  b.querySelector(".ico").textContent = on ? "■" : "🎧";
  b.setAttribute("aria-label", on ? "Stop listening" : "Listen to the whole period, 2023 to 2026");
}

const handlers = {
  onPick(i) {
    const g = game;
    if (!g || g.busy || g.finished) return;
    const p = g.pairs[g.i];
    if (i !== p.a && i !== p.b) return;          // лише нейрони активної пари
    stopListeningAll();
    if (i === p.correct) {
      if (g.errors === 0) g.firstTry += 1;
      UI.speak("Yes!");
      openInterval(false);
    } else {
      UI.wrong(i);
      earcon("no");
      g.errors += 1;
      const msg = `Not quite. ${p.q.hint} Listen to both months again and choose once more — or ring the bell.`;
      pairMessage(msg);
      UI.announce(msg);
      UI.speak(msg);
    }
  },
  onListen(i) {
    const p = game?.pairs[game.i];
    if (!game || game.busy || game.finished || (i !== p.a && i !== p.b)) return;   // слухати можна лише активну пару
    stopListeningAll();
    UI.stopSpeak();
    playMonth(i);
  },
  onBell() {
    const g = game;
    if (!g) return;
    if (g.busy) {                     // повторний дзвіночок під час відповіді природи → зупинити й перейти далі
      g.skip = true; UI.stopSpeak(); stopPlayback();
      return;
    }
    if (g.finished) { UI.ringBell(); bowl(); UI.announce(STORY_OPEN); UI.speak(STORY_OPEN); return; }
    openInterval(true);
  },
  onTrack(track, vol, enabled) {
    mix[track] = enabled ? vol : 0;
    applyMix();
  },
  onEnterGame() {
    if (game && !game.busy && !listeningAll) showPairState();
  },
};

// ======================= Регіони =======================
async function loadRegion(id) {
  const v = videos.find((x) => x.id === id) || videos[0];
  const token = ++loadToken;
  stopListeningAll();
  stopPlayback();
  UI.stopSpeak();
  $("region-select").value = v.id;
  document.title = `${NAMES[v.id] || v.title} · The Earth Information Jukebox`;
  crop = v.crop || null;
  layoutVideo();
  const src = v.has_local_video ? `/media/${v.local_video}` : v.video_url;
  if (src && !video.src.endsWith(src)) video.src = src;

  const [s, f] = await Promise.all([getJSON(`/api/score/${v.id}`), getJSON(`/api/features/${v.id}`)]);
  const p = new ScorePlayer(s, { getTime: () => video.currentTime, getRate: () => video.playbackRate });
  await p.load();
  if (token !== loadToken) return p.dispose();   // за цей час обрали інший регіон
  if (game) game.skip = true;
  player?.dispose();
  player = p; score = s; features = f;
  applyMix();

  neurons = buildNeurons();
  const labels = neurons.map((n) => n.short), full = neurons.map((n) => n.full);
  if (!uiReady) { UI.init(labels, handlers); uiReady = true; }
  UI.setNodes(labels, full);
  game = buildGame();
  current = v.id;
  video.currentTime = 0;
  focusGlobe(v);
  showPairState();
  UI.announce(`${NAMES[v.id]}. ${KEYS_HELP}`);
}

const KEYS_HELP = "Space rings the bell and opens the current pair. Enter plays the whole story. 1 or 2 answers, R replays, Escape stops.";

/** Повернути 3D-глобус до центру регіону (центр crop у рівнопроміжній проекції 4096×2048) */
function focusGlobe(v) {
  if (!globe || !v?.crop) return;
  const [x, y, w, h] = v.crop;
  globe.setFocus(((x + w / 2) / 4096) * 360 - 180, 90 - ((y + h / 2) / 2048) * 180);
}

const inGame = () => !$("game-shell").classList.contains("intro-mode");
const goToGame = () => { if (!inGame()) window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" }); };

// Клавіатура. Головні дії — пробіл (дзвіночок) і Enter (слухати все): вони не конфліктують зі скрінрідерами
// (NVDA/JAWS у режимі перегляду перехоплюють літери й цифри для навігації: F — поле форми, 1–6 — заголовки…).
// Клавіші за фізичним кодом (e.code), тож працюють у будь-якій розкладці.
window.addEventListener("keydown", (e) => {
  if (!game || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest("input, select, textarea")) return;
  // Кнопки на стрічці нейронів не «забирають» пробіл: він завжди = дзвіночок (Enter на нейроні = відповідь)
  const onAnyControl = !!e.target.closest("button, summary, a");
  const onControl = onAnyControl && !e.target.closest(".neuron-stage");
  if (e.code === "Escape") { stopListeningAll(true); if (game.busy) handlers.onBell(); else { stopPlayback(); UI.stopSpeak(); } return; }
  if (e.code === "Space" && !onControl) { e.preventDefault(); goToGame(); handlers.onBell(); return; }
  if ((e.code === "Enter" || e.code === "NumpadEnter") && !onAnyControl) { e.preventDefault(); goToGame(); listenAll(); return; }
  if (!inGame() || onControl) return;
  const p = game.pairs[game.i];
  if (game.finished || game.busy || !p) return;
  if (["Digit1", "Numpad1", "ArrowLeft"].includes(e.code)) { e.preventDefault(); handlers.onPick(p.a); }
  if (["Digit2", "Numpad2", "ArrowRight"].includes(e.code)) { e.preventDefault(); handlers.onPick(p.b); }
  if (e.code === "KeyR") { e.preventDefault(); replayLast(); }
});

// Фокус клавіатурою/скрінрідером у грі, поки видно планету → прокрутити до гри
$("game-shell").addEventListener("focusin", goToGame);

(async function init() {
  const all = await getJSON("/api/videos");
  videos = REGIONS.map(([id]) => all.find((v) => v.id === id)).filter(Boolean);
  const sel = $("region-select");
  sel.innerHTML = videos.map((v) => `<option value="${v.id}">${NAMES[v.id]}</option>`).join("");
  sel.onchange = () => (location.hash = sel.value);
  addEventListener("hashchange", () => loadRegion(location.hash.slice(1)));
  $("listen-all").onclick = () => listenAll();
  // 3D-глобус: окремий модуль з CDN; якщо не завантажиться — лишається 2D-текстура
  import("./globe.js")
    .then((m) => { globe = m.createGlobe($("earth-orb"), "/static/img/earth_ndvi.jpg"); focusGlobe(videos.find((x) => x.id === current)); })
    .catch(() => {});
  await loadRegion(location.hash.slice(1));
})().catch((e) => document.body.insertAdjacentHTML("afterbegin", `<p style="position:fixed;z-index:99;color:#f88;padding:16px">Error: ${e.message}</p>`));
