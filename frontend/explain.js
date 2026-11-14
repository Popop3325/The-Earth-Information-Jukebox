// Панель «Що зараз звучить»: показує дані в поточний момент і у що вони перетворюються у звуці,
// плюс вимикачі шарів, щоб почути кожен окремо. Працює для пресету "seasons" (є score.legend).

const $ = (id) => document.getElementById(id);
const pct = (v) => `${Math.round(v * 100)}%`;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Групи шарів для вимикачів: назва → id шарів/голосів у партитурі */
export const GROUPS = [
  { key: "air", label: "🌬 Повітря", ids: ["air"] },
  { key: "bells", label: "🔔 Дзвони", ids: ["bells"] },
  { key: "wind", label: "🎶 Духовий голос", ids: ["wind"] },
  { key: "bg", label: "🎹 Фон і дрон", ids: ["pad", "drone_D", "drone_F"] },
  { key: "tex", label: "❄ Лід і 🪵 дерево", ids: ["ice", "wood"] },
  { key: "birds", label: "🐦 Птахи", ids: ["birds"] },
];

function featuresAt(features, t) {
  const fr = features.frames;
  if (t <= fr[0].t) return fr[0];
  for (let i = 1; i < fr.length; i++) {
    if (t <= fr[i].t) {
      const a = fr[i - 1], b = fr[i], x = (t - a.t) / Math.max(b.t - a.t, 1e-9);
      const out = {};
      for (const k of features.features) out[k] = a[k] + (b[k] - a[k]) * x;
      return out;
    }
  }
  return fr[fr.length - 1];
}

function dateAt(timeline, t) {
  if (!timeline) return "";
  const d = new Date(timeline.start);
  d.setDate(d.getDate() + Math.round(t * timeline.days_per_second));
  return d.toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * @param score    партитура (/api/score)
 * @param features датасет (/api/features)
 * @param muted    Set ключів груп, вимкнених користувачем (зберігається між пресетами)
 * @param onMute   (ids, muted) => void — передати в player.setMuted
 * @returns update(t) або null, якщо панель для цього пресету не потрібна
 */
export function setupExplain(score, features, muted, onMute) {
  const box = $("explain");
  const L = score.legend;
  if (!L || !features?.features?.includes("white_frac")) {
    box.hidden = true;
    return null;
  }
  box.hidden = false;

  // Вимикачі шарів
  const mixer = $("mixer");
  mixer.querySelectorAll("label").forEach((n) => n.remove());
  for (const g of GROUPS) {
    const lab = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !muted.has(g.key);
    cb.onchange = () => {
      cb.checked ? muted.delete(g.key) : muted.add(g.key);
      onMute(g.ids, !cb.checked);
      draw(lastT);
    };
    lab.append(cb, " " + g.label);
    mixer.append(lab);
    if (muted.has(g.key)) onMute(g.ids, true);
  }

  // Рядки пояснення: [ключ групи, іконка, дані (текст, 0..1 для смужки), звук]
  const rows = [
    ["air", "❄"], ["tex", "🟫"], ["bells", "🌿"], ["wind", "📈"], ["wind", "↕"], ["bg", "🎵"],
  ];
  const ul = $("explain-rows");
  ul.innerHTML = rows
    .map(([, icon]) => `<li><span aria-hidden="true">${icon}</span><span class="data"></span><span class="sound"></span></li>`)
    .join("");
  const lis = [...ul.children];

  let lastT = 0;
  function set(i, dataText, level, soundText) {
    const li = lis[i];
    li.querySelector(".data").innerHTML = `${dataText}<div class="bar"><i style="width:${pct(clamp01(level))}"></i></div>`;
    li.querySelector(".sound").textContent = "→ " + soundText;
    li.classList.toggle("off", muted.has(rows[i][0]));
  }

  function draw(t) {
    lastT = t;
    const f = featuresAt(features, t);
    $("explain-date").textContent = dateAt(score.timeline, t);

    const snow = f.white_frac, earth = f.earth_frac, green = f.green_frac, ndvi = f.ndvi_mean, up = f.green_up_rate;
    set(0, `Сніг ${pct(snow)}`, snow / 0.6,
      snow > 0.35 ? "хуртовина з поривами і тонким свистом" : snow > 0.1 ? "пориви вітру" : "без хуртовини");
    set(1, `Гола земля ${pct(earth)}`, earth / 0.35,
      `сухий вітер ${earth > 0.2 ? "гучніше" : "тихіше"}; ${earth > L.wood_from && green < 0.5 ? "дерев'яні клацання" : "без клацань"}${snow > L.ice_from ? ", хрускіт льоду" : ""}`);
    const strikes = green < L.bells_min ? "дзвони мовчать (зелені < 20%)" : green < L.bells_double ? "1 удар дзвону на такт" : "2 удари дзвону на такт";
    set(2, `Зелень ${pct(green)}`, green, strikes + (snow > 0.2 ? ", звук «скляний»" : ", звук теплий"));
    set(3, `NDVI ${ndvi.toFixed(2)}`, (ndvi - 0.25) / 0.42,
      ndvi > 0.5 ? "високі ноти, довгі фрази" : ndvi > 0.35 ? "середній регістр" : "низькі ноти, короткі фрази");
    set(4, up > L.glide_up ? "Зелень росте" : up < L.glide_down ? "Зелень спадає" : "Без змін", Math.abs(up - 0.5) * 2,
      up > L.glide_up ? "мелодія йде ВГОРУ" : up < L.glide_down ? "мелодія йде ВНИЗ" : "мелодія «аркою»");
    const summer = green >= L.season_split;
    set(5, summer ? "Літо" : "Зима", green, summer ? "фа-мажор, тоніка F (світло)" : "ре-мінор, тоніка D (прохолодно)");
  }

  let n = 0;
  draw(0);
  return (t) => { if (n++ % 4 === 0) draw(t); }; // ~6 разів на секунду
}
