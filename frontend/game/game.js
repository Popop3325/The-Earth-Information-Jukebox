// Гра «де більше птахів?» — ЗАГОТОВКА, яку розвиває №5 (гейміфікація).
// Дані: GET /api/quiz/<id> (роки, метрики, правильні відповіді) і GET /api/score/<id> (звук).
// Звук: спільний ScorePlayer з ../player.js.
import { ScorePlayer } from "../player.js";

const VIDEO_ID = new URLSearchParams(location.search).get("video") || "ndvi_north_america";
const SEGMENT_SECONDS = 6; // скільки реальних секунд звучить відрізок між двома роками

const SUBJECT = { vegetation: "зелені", birds: "птахів" };

// Тексти. Подача англійською → додайте "en" і перемикач мови.
const T = {
  more: (s) => `Коли БІЛЬШЕ ${SUBJECT[s] || s}?`,
  less: (s) => `Коли МЕНШЕ ${SUBJECT[s] || s}?`,
  listen: "🔊 Слухати",
  correct: "Правильно! Слухаємо, як змінювався звук.",
  wrong: "Ні. Послухайте ще раз баланс звуків.",
  hint: "Підказка: відкриваємо відрізок.",
  win: (score, total) => `Перемога! ${score} з ${total} з першої спроби. Натисніть «Почати», щоб послухати все.`,
  pair: (a, b) => `Наступна пара: ${a} і ${b}.`,
};

const $ = (id) => document.getElementById(id);
const video = $("video");
const announce = (text) => ($("announce").textContent = text);

const state = { quiz: null, player: null, pair: 0, fixedT: null, busy: false, firstTry: 0, errors: 0, questions: [] };

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

/** Звук одного року: «заморожуємо» час на ключовому кадрі */
function listenYear(i) {
  if (state.busy) return;
  const kf = state.quiz.keyframes[i];
  state.fixedT = kf.t;
  video.currentTime = kf.t;
  state.player.resume();
  announce(`${kf.label}`);
  clearTimeout(state.listenTimer);
  state.listenTimer = setTimeout(() => state.player.pause(), 3000);
}

/** Програти відрізок між роками a→b уповільнено, потім наступна пара */
function playSegment(a, b) {
  const [ka, kb] = [state.quiz.keyframes[a], state.quiz.keyframes[b]];
  state.busy = true;
  state.fixedT = null;
  video.currentTime = ka.t;
  video.playbackRate = Math.max((kb.t - ka.t) / SEGMENT_SECONDS, 0.0625);
  state.player.resume();
  video.play();
  const stopAt = () => {
    if (video.currentTime < kb.t) return requestAnimationFrame(stopAt);
    video.pause();
    state.player.pause();
    state.busy = false;
    state.pair++;
    state.errors = 0;
    render();
  };
  requestAnimationFrame(stopAt);
}

function answer(i) {
  if (state.busy) return;
  const p = state.quiz.pairs[state.pair];
  const correct = state.questions[state.pair] === "more" ? p.more : p.less;
  if (i === correct) {
    if (state.errors === 0) state.firstTry++;
    announce(T.correct);
    playSegment(p.a, p.b);
  } else {
    state.errors++;
    announce(T.wrong);
  }
}

function hint() {
  if (state.busy || state.pair >= state.quiz.pairs.length) return;
  const p = state.quiz.pairs[state.pair];
  announce(T.hint);
  playSegment(p.a, p.b);
}

function render() {
  const { quiz } = state;
  const box = $("years");
  box.innerHTML = "";
  if (state.pair >= quiz.pairs.length) {
    $("question").textContent = "";
    $("hint-btn").hidden = true;
    $("start-btn").hidden = false;
    $("start-btn").textContent = "▶ Послухати весь період";
    $("start-btn").onclick = () => playSegment(0, quiz.keyframes.length - 1);
    announce(T.win(state.firstTry, quiz.pairs.length));
    $("score").textContent = T.win(state.firstTry, quiz.pairs.length);
    return;
  }
  const p = quiz.pairs[state.pair];
  if (!state.questions[state.pair]) state.questions[state.pair] = Math.random() < 0.5 ? "more" : "less";
  $("question").textContent = T[state.questions[state.pair]](quiz.subject);
  for (const i of [p.a, p.b]) {
    const kf = quiz.keyframes[i];
    const card = document.createElement("div");
    card.className = "year";
    card.innerHTML = `<button class="pick" type="button" aria-label="Відповідь: ${kf.label}">${kf.label}</button>
                      <button class="listen" type="button" aria-label="Слухати ${kf.label}">${T.listen}</button>`;
    card.querySelector(".pick").onclick = () => answer(i);
    card.querySelector(".listen").onclick = () => listenYear(i);
    box.append(card);
  }
  $("score").textContent = `Пара ${state.pair + 1} з ${quiz.pairs.length}`;
  announce($("question").textContent + " " + T.pair(quiz.keyframes[p.a].label, quiz.keyframes[p.b].label));
}

async function init() {
  const [quiz, score, videos] = await Promise.all([
    getJSON(`/api/quiz/${VIDEO_ID}`), getJSON(`/api/score/${VIDEO_ID}`), getJSON("/api/videos"),
  ]);
  state.quiz = quiz;
  const meta = videos.find((v) => v.id === VIDEO_ID);
  video.src = meta?.has_local_video ? `/media/${meta.local_video}` : meta?.video_url || "";
  state.player = new ScorePlayer(score, {
    getTime: () => state.fixedT ?? video.currentTime,
    getRate: () => video.playbackRate,
  });
  await state.player.load();

  $("start-btn").onclick = async () => {
    await Tone.start();
    state.player.start();
    state.player.pause();
    $("start-btn").hidden = true;
    $("hint-btn").hidden = false;
    render();
  };
  $("hint-btn").onclick = hint;
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && !$("hint-btn").hidden && e.target === document.body) { e.preventDefault(); hint(); }
  });
}

init().catch((e) => ($("question").textContent = "Помилка: " + e.message));
