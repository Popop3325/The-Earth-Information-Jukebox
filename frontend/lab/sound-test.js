// Тест асоціацій: кожен варіант — маленька партитура (~8 с), яку грає ТОЙ САМИЙ ScorePlayer, що й проєкт.
// Отже, що оберете тут, саме так і звучатиме в підсумковій озвучці.

const BEAT = 60 / 72;          // 0.833 с — сітка проєкту
const DUR = 8;                 // тривалість демо, с
const PENTA = [0, 3, 5, 7, 10]; // D F G A C
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const note = (midi) => `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
/** ступінь пентатоніки → нота (0 = D4) */
const p = (deg, base = 62) => note(base + 12 * Math.floor(deg / 5) + PENTA[((deg % 5) + 5) % 5]);
const lin = (a, b) => [[0, a], [DUR, b]];     // крива гучності/параметра
const flat = (v) => lin(v, v);
const beats = (n) => Array.from({ length: n }, (_, i) => +(i * BEAT).toFixed(3));

const ev = (t, instrument, notes, extra = {}) => ({ t, voice: extra.voice || instrument, instrument, notes, dur: 0.6, vel: 0.5, ...extra });
const bell = (t, deg, o = {}) => ev(t, "tuned_bell", [p(deg)], { ring: 2, tierce: 1.22, glass: 0, vel: 0.55, ...o });
const wind = (t, deg, o = {}) => ev(t, "wind_voice", [p(deg, 50)], { dur: BEAT * 0.95, vel: 0.45, timbre: 0.5, ...o });
const sample = (id, file, gain) => ({ id, sample: file, loop: true, loop_trim: 0.1, gain });
const air = (variant, gain, intensity) => ({ id: "air_" + variant, synth: { type: "air", variant }, gain, params: { intensity } });
const drone = (id, notes, gain) => ({ id, synth: { type: "drone", notes }, gain });
const score = (layers = [], events = []) => ({ tempo_bpm: 72, duration_s: DUR, layers, events: events.sort((a, b) => a.t - b.t) });

const DM7 = ["D3", "A3", "C4", "F4"];
const FADD9 = ["F3", "C4", "G4", "A4"];

export const QUESTIONS = [
  {
    id: "winter", title: "1. Що звучить як ЗИМА / сніг?",
    hint: "Північна Америка взимку: до 60% суші під снігом.",
    options: [
      { id: "howl", label: "Вітер виє в щілинах", build: () => score([air("howl", flat(0.8), flat(0.8))]) },
      { id: "storm", label: "Глибокий шторм", build: () => score([air("storm", flat(0.8), flat(0.8))]) },
      { id: "drift", label: "Заметіль: шурхіт снігу", build: () => score([air("driftsnow", flat(0.8), flat(0.8))]) },
      { id: "glass", label: "Скляні дзвони + хрускіт льоду", build: () => score([air("howl", flat(0.2), flat(0.3))],
          [...beats(10).filter((_, i) => i % 2 === 0).map((t, i) => bell(t, 6 + (i % 3), { ring: 0.5, glass: 1, tierce: 1.2 })),
           ...beats(10).flatMap((t) => [t, t + BEAT / 2]).filter((_, i) => i % 3 === 0).map((t) => ev(t, "ice", ["C7"], { dur: 0.03, vel: 0.35 }))]) },
    ],
  },
  {
    id: "summer", title: "2. Що звучить як ЛІТО / пік зелені?",
    hint: "Серпень: понад 60% суші вкрито густою зеленню.",
    options: [
      { id: "birds", label: "Птахи", build: () => score([sample("birds", "birds.m4a", flat(0.7))]) },
      { id: "bowls", label: "Теплі дзвони / чаші", build: () => score([], beats(10).map((t, i) => bell(t, 5 + [0, 2, 1, 3][i % 4], { ring: 3, tierce: 1.25 }))) },
      { id: "clarinet", label: "Довга мелодія кларнета", build: () => score([], [0, 2, 4, 6, 8].map((b, i) => wind(b * BEAT, 7 + [0, 1, 2, 1, 0][i], { timbre: 1, dur: BEAT * 1.9 }))) },
      { id: "warmwind", label: "Теплий вітер (запис)", build: () => score([sample("warm", "wind_warm.m4a", flat(0.8))]) },
    ],
  },
  {
    id: "spring", title: "3. Що звучить як ВЕСНА (зелень росте)?",
    hint: "Квітень–червень: сніг тане, зелень іде на північ. Демо показує зміну за 8 с.",
    options: [
      { id: "melody_up", label: "Мелодія йде вгору", build: () => score([], beats(9).map((t, i) => wind(t, 3 + i, { glide_from: p(2 + i, 50), timbre: i / 8 }))) },
      { id: "bells_denser", label: "Дзвони частішають і стають вищими", build: () => score([],
          [[0], [2 * BEAT], [4 * BEAT, 5 * BEAT], [6 * BEAT, 6.5 * BEAT, 7 * BEAT, 7.5 * BEAT, 8 * BEAT, 8.5 * BEAT]].flat().map((t, i) => bell(t, 5 + Math.floor(i / 2), { ring: 1.5 }))) },
      { id: "birds_in", label: "З'являються птахи, вітер теплішає", build: () => score([sample("birds", "birds.m4a", lin(0, 0.8)), air("howl", lin(0.6, 0), lin(0.7, 0)), sample("warm", "wind_warm.m4a", lin(0, 0.5))]) },
      { id: "chord_bright", label: "Акорд світлішає (ре-мінор → фа-мажор)", build: () => score(
          [drone("dD", ["D2", "D3", "A3"], lin(0.14, 0)), drone("dF", ["F2", "F3", "C4"], lin(0, 0.14))],
          [ev(0, "pad", DM7, { dur: 4 * BEAT, vel: 0.35 }), ev(4.5 * BEAT, "pad", FADD9, { dur: 4.5 * BEAT, vel: 0.35 })]) },
    ],
  },
  {
    id: "autumn", title: "4. Що звучить як ОСІНЬ (зелень спадає)?",
    hint: "Вересень–листопад: ліси буріють, повертаються сніг і гола земля.",
    options: [
      { id: "melody_down", label: "Мелодія йде вниз", build: () => score([], beats(9).map((t, i) => wind(t, 11 - i, { glide_from: p(12 - i, 50), timbre: 1 - i / 8 }))) },
      { id: "dry_wood", label: "Сухий вітер і дерев'яні клацання", build: () => score([air("classic", flat(0.5), lin(0.2, 0.5))],
          beats(10).filter((_, i) => i % 2 === 1).map((t) => ev(t + BEAT / 2, "wood", ["A3"], { dur: 0.05, vel: 0.4 }))) },
      { id: "chord_dark", label: "Акорд темнішає (фа-мажор → ре-мінор)", build: () => score(
          [drone("dF", ["F2", "F3", "C4"], lin(0.14, 0)), drone("dD", ["D2", "D3", "A3"], lin(0, 0.14))],
          [ev(0, "pad", FADD9, { dur: 4 * BEAT, vel: 0.35 }), ev(4.5 * BEAT, "pad", DM7, { dur: 4.5 * BEAT, vel: 0.35 })]) },
      { id: "bells_thin", label: "Дзвони рідшають і холоднішають", build: () => score([],
          [0, 0.5, 2, 2.5, 4, 6, 8].map((b, i) => bell(b * BEAT, 9 - i, { ring: 3 - i * 0.4, glass: i / 6, tierce: 1.25 - i * 0.008 }))) },
    ],
  },
  {
    id: "bare", title: "5. Що звучить як ГОЛА ЗЕМЛЯ / посуха?",
    hint: "Ранньої весни й пізньої осені до 35% суші без снігу і без зелені.",
    options: [
      { id: "dry_wind", label: "Сухий шурхітливий вітер", build: () => score([air("classic", flat(0.6), flat(0.35))]) },
      { id: "wood", label: "Дерев'яні клацання", build: () => score([], beats(10).flatMap((t) => [t, t + BEAT / 2]).filter((_, i) => i % 3 !== 1).map((t) => ev(t, "wood", ["A3"], { dur: 0.05, vel: 0.4 }))) },
      { id: "empty_drone", label: "Порожній низький дрон", build: () => score([drone("dD", ["D2", "A2"], flat(0.2))]) },
      { id: "silence", label: "Майже тиша (тихий вітер)", build: () => score([sample("warm", "wind_warm.m4a", flat(0.15))]) },
    ],
  },
  {
    id: "more_green", title: "6. Як має звучати «БІЛЬШЕ зелені»?",
    hint: "У кожному демо зелень росте від мінімуму до максимуму за 8 с. Що найзрозуміліше?",
    options: [
      { id: "louder", label: "Гучніше", build: () => score([sample("birds", "birds.m4a", lin(0.05, 0.9))]) },
      { id: "higher", label: "Вище", build: () => score([], beats(10).map((t, i) => bell(t, 3 + i, { ring: 1, vel: 0.5 }))) },
      { id: "denser", label: "Частіше (більше нот)", build: () => score([],
          [0, 2, 3.5, 4.5, 5.25, 6, 6.5, 7, 7.5, 8, 8.25, 8.5, 8.75, 9].map((b) => ev(b * BEAT, "pluck", [p(7)], { dur: 0.2, vel: 0.45 }))) },
      { id: "warmer", label: "Тепліший, «соковитіший» тембр", build: () => score([], beats(9).map((t, i) => wind(t, 5, { timbre: i / 8, dur: BEAT * 0.9 }))) },
    ],
  },
  {
    id: "lead", title: "7. Головний мелодичний голос — хто?",
    hint: "Одна й та сама мелодія різними інструментами.",
    options: [
      { id: "flute", label: "Флейта / кларнет", build: () => score([], [0, 1, 2, 4, 5, 6].map((b, i) => wind(b * BEAT, [5, 7, 8, 7, 6, 5][i], { timbre: 0.4, dur: BEAT * 0.95 }))) },
      { id: "tuned_bell", label: "Дзвони (з терцією)", build: () => score([], [0, 1, 2, 4, 5, 6].map((b, i) => bell(b * BEAT, [5, 7, 8, 7, 6, 5][i], { ring: 1.2 }))) },
      { id: "fm_bell", label: "Дзвіночки (як у vegetation)", build: () => score([], [0, 1, 2, 4, 5, 6].map((b, i) => ev(b * BEAT, "bell", [p([5, 7, 8, 7, 6, 5][i])], { dur: 0.6, vel: 0.5 }))) },
      { id: "pluck", label: "Піцикато / щипок", build: () => score([], [0, 1, 2, 4, 5, 6].map((b, i) => ev(b * BEAT, "pluck", [p([5, 7, 8, 7, 6, 5][i])], { dur: 0.4, vel: 0.5 }))) },
    ],
  },
  {
    id: "layers", title: "8. Скільки шарів одночасно комфортно слухати?",
    hint: "Слухайте 2–3 хвилини поспіль: що не втомлює й лишається зрозумілим?",
    options: [
      { id: "two", label: "2 шари: вітер + дзвони", build: () => score([sample("warm", "wind_warm.m4a", flat(0.5))], [0, 2, 4, 6, 8].map((b, i) => bell(b * BEAT, 6 + (i % 3)))) },
      { id: "three", label: "3 шари: + духовий голос", build: () => score([sample("warm", "wind_warm.m4a", flat(0.5))],
          [...[0, 2, 4, 6, 8].map((b, i) => bell(b * BEAT, 6 + (i % 3))), ...[1, 3, 5, 7].map((b, i) => wind(b * BEAT, 4 + i, { timbre: 0.6, dur: BEAT * 1.8 }))]) },
      { id: "five", label: "5 шарів: + птахи + фон і дрон", build: () => score(
          [sample("warm", "wind_warm.m4a", flat(0.5)), sample("birds", "birds.m4a", flat(0.3)), drone("dF", ["F2", "F3", "C4"], flat(0.12))],
          [...[0, 2, 4, 6, 8].map((b, i) => bell(b * BEAT, 6 + (i % 3))), ...[1, 3, 5, 7].map((b, i) => wind(b * BEAT, 4 + i, { timbre: 0.6, dur: BEAT * 1.8 })),
           ev(0, "pad", FADD9, { dur: 4 * BEAT, vel: 0.3 }), ev(4 * BEAT, "pad", FADD9, { dur: 5 * BEAT, vel: 0.3 })]) },
    ],
  },
  {
    id: "background", title: "9. Який потрібен фон (підкладка)?",
    hint: "Тихий фон під усім. Слухайте разом із дзвонами.",
    options: [
      { id: "pad_drone", label: "Акорд + дрон", build: () => score([drone("dD", ["D2", "D3", "A3"], flat(0.14))],
          [ev(0, "pad", DM7, { dur: 9 * BEAT, vel: 0.3 }), ...[0, 2, 4, 6, 8].map((b, i) => bell(b * BEAT, 6 + (i % 3)))]) },
      { id: "drone", label: "Лише дрон", build: () => score([drone("dD", ["D2", "D3", "A3"], flat(0.14))], [0, 2, 4, 6, 8].map((b, i) => bell(b * BEAT, 6 + (i % 3)))) },
      { id: "none", label: "Без фону", build: () => score([], [0, 2, 4, 6, 8].map((b, i) => bell(b * BEAT, 6 + (i % 3)))) },
    ],
  },
];
