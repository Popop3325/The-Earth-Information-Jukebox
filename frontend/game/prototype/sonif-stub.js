// ЗАГЛУШКА СОНІФІКАЦІЇ (об'єкт Sonif). Справжній Sonif від сонификатора має ті самі назви й поведінку.
// Тут «звук року» = три зациклені семпли (птахи, дзвіночки, вітер) з гучністю з getLevels(i).
// Усі play* повертають Promise: він завершується, коли доіграло АБО коли викликали stop()/інший play*.
// Відео (#clip) теж ведеться звідси, щоб картинка йшла синхронно зі звуком.
import { CLIP } from "./clip-stub.js";

const SOUNDS = "/static/sounds/";
const YEAR_SECONDS = 3;        // скільки звучить один рік («Слухати»)
const clamp = (x) => Math.min(1, Math.max(0, x));
const lerp = (a, b, k) => a + (b - a) * k;

let video = null, layers = null, cancel = null, ac = null;

function ensureLayers() {
  if (layers) return;
  layers = {};
  for (const [name, file] of [["birds", "birds.m4a"], ["chimes", "chimes.m4a"], ["wind", "wind.m4a"]]) {
    const a = new Audio(SOUNDS + file); a.loop = true; a.volume = 0; layers[name] = a;
  }
}
function setVolumes(l) { for (const k in layers) layers[k].volume = clamp(l[k]); }
function mix(la, lb, k) { return { birds: lerp(la.birds, lb.birds, k), chimes: lerp(la.chimes, lb.chimes, k), wind: lerp(la.wind, lb.wind, k) }; }

function halt() {                       // зупинити все, що грає
  if (cancel) { const c = cancel; cancel = null; c(); }
  if (layers) for (const k in layers) { layers[k].pause(); layers[k].volume = 0; }
  if (video) video.pause();
}

/** Запустити новий фрагмент на `seconds` секунд; onTick(0..1) викликається щокадру */
function run(seconds, setup, onTick) {
  halt();
  ensureLayers();
  return new Promise((resolve) => {
    let done = false, raf = 0;
    const t0 = performance.now();
    const end = () => {
      if (done) return; done = true; cancelAnimationFrame(raf); cancel = null;
      for (const k in layers) layers[k].pause();
      if (video) video.pause();
      resolve();
    };
    cancel = end;
    setup();
    for (const k in layers) layers[k].play().catch(() => {});
    const tick = () => {
      if (done) return;
      const p = Math.min(1, (performance.now() - t0) / (seconds * 1000));
      onTick(p);
      if (p >= 1) return end();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });
}

function beep(freq) {                   // короткий сигнал без файлів
  ac = ac || new (window.AudioContext || window.webkitAudioContext)();
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = "sine"; o.frequency.value = freq; o.connect(g); g.connect(ac.destination);
  g.gain.setValueAtTime(0.25, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.3);
  o.start(); o.stop(ac.currentTime + 0.3);
}

export const Sonif = {
  /** videoEl — <video id="clip">. Один раз при завантаженні. */
  init(videoEl) {
    video = videoEl;
    video.src = CLIP.video;
    video.muted = true;
    ensureLayers();
  },

  /** Що чути в році i: числа 0..1. wind: 0 = легкий теплий вітерець, 1 = хуртовина.
   *  Тут вони рахуються з виміряної зелені; у справжній версії — з тих самих даних, що й звук. */
  getLevels(i) {
    const birds = clamp((CLIP.years[i].green - 0.10) / 0.08);
    return { birds, chimes: clamp(0.1 + 0.8 * birds), wind: 1 - birds };
  },

  /** Звук одного року (кнопка «Слухати») */
  playYear(i) {
    return run(YEAR_SECONDS, () => {
      video.pause(); video.currentTime = CLIP.years[i].t; setVolumes(Sonif.getLevels(i));
    }, () => {});
  },

  /** Плавний перехід від звуку року i до звуку року i+1, відео іде між цими роками */
  playInterval(i, seconds = 6) {
    const la = Sonif.getLevels(i), lb = Sonif.getLevels(i + 1);
    const t0 = CLIP.years[i].t, t1 = CLIP.years[i + 1].t;
    return run(seconds, () => {
      video.currentTime = t0; video.playbackRate = Math.max((t1 - t0) / seconds, 0.0625);
      video.play().catch(() => {}); setVolumes(la);
    }, (p) => setVolumes(mix(la, lb, p)));
  },

  /** Уся сонифікація від першого року до останнього */
  playAll(seconds = 20) {
    const n = CLIP.years.length, t0 = CLIP.years[0].t, t1 = CLIP.years[n - 1].t;
    return run(seconds, () => {
      video.currentTime = t0; video.playbackRate = Math.max((t1 - t0) / seconds, 0.0625);
      video.play().catch(() => {});
    }, (p) => {
      const x = p * (n - 1), i = Math.min(Math.floor(x), n - 2);
      setVolumes(mix(Sonif.getLevels(i), Sonif.getLevels(i + 1), x - i));
    });
  },

  stop() { halt(); },

  /** Короткі сигнали: "correct" | "wrong" | "bell" (колокольчик на пробіл) */
  cue(name) {
    if (name === "bell") {
      const a = new Audio(SOUNDS + "chime.m4a");
      a.play().catch(() => beep(1046));
    } else beep(name === "correct" ? 880 : 220);
  },
};
