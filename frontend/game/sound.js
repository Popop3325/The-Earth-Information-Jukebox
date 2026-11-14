// ЗВУК ГРИ. Тонка обгортка над спільним ScorePlayer (../player.js).
// Гра звертається лише до цього файлу і нічого не знає про Tone чи ScorePlayer.
// Усі play* повертають Promise, що завершується, коли відтворення закінчилось (або його перервали stop()).
import { ScorePlayer } from "../player.js";

const YEAR_SECONDS = 3;       // скільки звучить один рік («Слухати»)
const BELL_URL = "/static/sounds/chime.m4a";   // дзвіночок (шлях як у prototype: ../../sounds)

let player = null, video = null, quiz = null;
let fixedT = null;            // коли не null, звук «заморожено» на цьому часі відео
let cancel = null;            // функція, що зупиняє поточний play* і завершує його Promise
let synth = null;

const kf = (i) => quiz.keyframes[i];

function halt() {             // зупинити все, що грає
  if (cancel) { const c = cancel; cancel = null; c(); }
  if (video) video.pause();
  if (player) player.pause();
}

/** Запустити новий фрагмент: setup() готує відео/звук, done() каже, коли закінчилось */
function run(setup, isDone, maxMs) {
  halt();
  return new Promise((resolve) => {
    let finished = false, raf = 0, timer = 0;
    const end = () => {
      if (finished) return; finished = true;
      cancelAnimationFrame(raf); clearTimeout(timer); cancel = null;
      if (video) video.pause();
      if (player) player.pause();
      resolve();
    };
    cancel = end;
    setup();
    const tick = () => { if (finished) return; if (isDone()) return end(); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    timer = setTimeout(end, maxMs);   // запобіжник: Promise завжди завершується
  });
}

export const Sound = {
  /** Один раз при завантаженні сторінки */
  async load(q, score, videoEl) {
    quiz = q; video = videoEl;
    player = new ScorePlayer(score, {
      getTime: () => fixedT ?? video.currentTime,
      getRate: () => video.playbackRate,
    });
    await player.load();
  },

  /** Один раз по першому кліку (браузер не дає звук раніше) */
  async start() {
    await Tone.start();
    player.start();
    player.pause();
    synth = new Tone.Synth({ oscillator: { type: "sine" }, envelope: { attack: 0.005, decay: 0.2, sustain: 0, release: 0.3 } }).toDestination();
  },

  /** Звук одного року (кнопка «Слухати») */
  playYear(i) {
    const t0 = performance.now();
    return run(() => {
      fixedT = kf(i).t; video.pause(); video.currentTime = fixedT; player.resume();
    }, () => performance.now() - t0 >= YEAR_SECONDS * 1000, YEAR_SECONDS * 1000 + 500);
  },

  /** Відео + звук відрізка між роками a→b, уповільнено до `seconds` реальних секунд */
  playSegment(a, b, seconds = 6) {
    const [ka, kb] = [kf(a), kf(b)];
    return run(() => {
      fixedT = null;
      video.currentTime = ka.t;
      video.playbackRate = Math.max((kb.t - ka.t) / seconds, 0.0625);
      player.resume();
      video.play().catch(() => {});
    }, () => video.currentTime >= kb.t || video.ended, seconds * 1000 + 1500);
  },

  /** Увесь період від першого до останнього року */
  playAll(seconds = 20) { return Sound.playSegment(0, quiz.keyframes.length - 1, seconds); },

  stop() { halt(); },

  /** Короткі сигнали: "correct" | "wrong" | "bell" */
  cue(name) {
    if (name === "bell") {
      const a = new Audio(BELL_URL);
      a.play().catch(() => { if (synth) synth.triggerAttackRelease("C6", "2n"); });
      return;
    }
    if (synth) synth.triggerAttackRelease(name === "correct" ? "A5" : "A3", 0.25);
  },
};