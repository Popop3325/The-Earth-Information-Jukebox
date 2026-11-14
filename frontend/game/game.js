// ГРА «нейрони»: правила й порядок подій. 
//   вигляд → UI (ui-stub.js)      звук → Sonif (sonif-stub.js)      дані → CLIP (clip-stub.js)
// Коли з'являться справжні файли від колег, міняються ТІЛЬКИ ці два рядки імпорту (і clip-stub → API):
import { Sonif } from "./prototype/sonif-stub.js";
import { UI } from "./prototype/ui-stub.js";
import { CLIP } from "./prototype/clip-stub.js";

// Два шляхи через одну й ту саму пару, результат однаковий (зв'язок + відкритий фрагмент):
//   1) відповідь на питання → Game.pick(i)  (клік / Enter на нейроні)
//   2) дзвіночок / ПРОБІЛ    → Game.bell()   (без питання; для незрячих і щоб пропустити)
// Голос каже лише ділянку («Ділянка з … по …») і наприкінці підказку про Ctrl. Ні «вірно», ні «перемога».

const BELL_PAUSE = 2500;   // мс: дзвін, потім той самий фрагмент
const SEGMENT_SECONDS = 6;

// Типи питань. score(levels) — «скільки цього» в році; правильний нейрон = де score більший (dir 1) або менший (dir -1).
// Рахується з Sonif.getLevels(i), тобто з тих самих даних, що чутно у звуці.
const QUESTIONS = [
  { text: "У якому періоді природа живіша?",        score: (l) => l.birds + l.chimes, dir: 1 },
  { text: "У якому періоді птахи активніші?",        score: (l) => l.birds,            dir: 1 },
  { text: "Де віє теплий літній вітер?",             score: (l) => l.wind,             dir: -1 },
  { text: "Де віє хуртовина?",                       score: (l) => l.wind,             dir: 1 },
  { text: "У якому періоді природа заснула?",        score: (l) => l.birds + l.chimes, dir: -1 },
];

const T = {
  hint: "Можна натиснути пробіл і послухати цей фрагмент без питання",
  section: (a, b) => `Ділянка з ${a.gen} по ${b.label}`,
  dynamics: (a, b) => `Динаміка: ${a.label} – ${b.label}`,
  done: "Нейронну мережу збудовано",
  allBtn: "Слухати весь період (Ctrl)",
  allAgain: "Слухати ще раз (Ctrl)",
  allSay: "Натисніть Ctrl, щоб послухати весь часовий проміжок",
  allTitle: (a, b) => `Увесь період з ${a.gen} по ${b.label}`,
  pair: (n, total) => `Пара ${n} з ${total}`,
};

const years = CLIP.years;
const state = { pair: 0, busy: false, finished: false, errors: 0, firstTry: 0, q: [] };
const pairCount = () => years.length - 1;

function correctNeuron(pairIdx) {              // яка з двох відповідей правильна
  const q = state.q[pairIdx], a = pairIdx, b = pairIdx + 1;
  const sa = q.score(Sonif.getLevels(a)) * q.dir, sb = q.score(Sonif.getLevels(b)) * q.dir;
  return sa >= sb ? a : b;
}

function askPair() {
  const a = state.pair, b = a + 1;
  if (!state.q[a]) state.q[a] = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
  UI.showHint("");
  UI.showPair(a, b);
  UI.showQuestion(state.q[a].text);
  UI.showBell(true);
  UI.setScore(T.pair(a + 1, pairCount()));
  const text = T.section(years[a], years[b]);
  UI.announce(text);
  UI.speak(text);
}

async function unlock(withBell) {              // відкрити фрагмент поточної пари
  const a = state.pair, b = a + 1;
  state.busy = true;
  UI.link(a, b);
  if (withBell) {
    UI.ringBell(); Sonif.cue("bell");
    await new Promise((r) => setTimeout(r, BELL_PAUSE));
    if (++state.errors >= 2) UI.showHint(T.hint);
  } else {
    Sonif.cue("correct");
  }
  UI.unlockScreen(T.dynamics(years[a], years[b]));
  await Sonif.playInterval(a, SEGMENT_SECONDS);   // чекаємо, поки фрагмент дограє
  UI.lockScreen();
  state.busy = false; state.errors = 0; state.pair++;
  if (state.pair >= pairCount()) finish(); else askPair();
}

function finish() {                            // усі фрагменти відкриті
  state.finished = true;
  UI.showBell(false); UI.hideQuestion(); UI.setScore("");
  UI.showMessage(T.done, T.allBtn, () => Game.playAll());
  UI.announce(T.allSay); UI.speak(T.allSay);
}

export const Game = {
  /** Кнопка «Почати дослідження» на стартовому екрані */
  start() {
    state.pair = 0; state.busy = false; state.finished = false; state.errors = 0; state.firstTry = 0; state.q = [];
    UI.hideMessage();
    askPair();
  },

  /** Гравець обрав нейрон i */
  pick(i) {
    if (state.busy || state.finished) return;
    const a = state.pair, b = a + 1;
    if (i !== a && i !== b) return;
    if (i === correctNeuron(a)) {
      if (state.errors === 0) state.firstTry++;
      unlock(false);
    } else {
      Sonif.cue("wrong"); UI.wrong(i);         // звук без слів + реакція на екрані
      if (++state.errors >= 2) UI.showHint(T.hint);
    }
  },

  /** Кнопка «Слухати» під нейроном: звук одного року */
  async listen(i) {
    if (state.busy || state.finished) return;
    UI.stopSpeak(); UI.announce(years[i].label);
    await Sonif.playYear(i);
  },

  /** Колокольчик / ПРОБІЛ: відкрити фрагмент без питання */
  bell() {
    if (state.busy || state.finished) return;
    UI.stopSpeak();
    unlock(true);
  },

  /** Ctrl: уся сонифікація (доступна після проходження) */
  async playAll() {
    if (state.busy || !state.finished) return;
    state.busy = true;
    const first = years[0], last = years[years.length - 1];
    UI.speak(T.allTitle(first, last));
    UI.unlockScreen(T.allTitle(first, last));
    await Sonif.playAll();
    UI.lockScreen();
    state.busy = false;
    UI.showMessage(T.done, T.allAgain, () => Game.playAll());
  },
};

window.Game = Game; window.UI = UI; window.Sonif = Sonif;   // щоб кнопки й консоль бачили (UI.* кличе Game.*)

window.addEventListener("keydown", (e) => {
  if (e.code === "CapsLock") UI.toggleVoice();
  if (e.code === "ControlLeft" || e.code === "ControlRight") { e.preventDefault(); Game.playAll(); }
  if (e.code === "Space" && e.target === document.body) { e.preventDefault(); Game.bell(); }
});

UI.init();
Sonif.init(document.getElementById("clip"));
UI.showMessage("Нейронна мережа природи", "Почати дослідження", () => Game.start());
