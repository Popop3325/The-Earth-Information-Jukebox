// Панель «Що зараз звучить»: показує дані в поточний момент і у що вони перетворюються у звуці,
// плюс вимикачі шарів, щоб почути кожен окремо. Працює для пресету "seasons" (є score.legend).

const $ = (id) => document.getElementById(id);
const pct = (v) => `${Math.round(v * 100)}%`;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Групи шарів для вимикачів: назва → id шарів/голосів у партитурі */
export const GROUPS = [
  { key: "air", label: "🌬 Вітер (зима/весна/літо/осінь)", ids: ["air_winter", "air_warm", "air_dry"] },
  { key: "chimes", label: "🎐 Колокольчики (зелень)", ids: ["chimes"] },
  { key: "birds", label: "🐦 Птахи", ids: ["birds"] },
  { key: "drips", label: "💧 Капель (танення)", ids: ["drips"] },
  { key: "wood", label: "🪵 Дерево (осінь)", ids: ["wood"] },
  { key: "wind", label: "🎶 Духовий голос", ids: ["wind"] },
  { key: "bg", label: "🎹 Фон і дрон", ids: ["pad", "drone_D", "drone_F"] },
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

  // Рядки пояснення: [ключ групи, іконка]
  const rows = [["air", "❄"], ["air", "🍂"], ["chimes", "🌿"], ["drips", "💧"], ["birds", "🐦"], ["bg", "🎵"]];
  const ul = $("explain-rows");
  ul.innerHTML = rows
    .map(([, icon]) => `<li><span aria-hidden="true">${icon}</span><span class="data"></span><span class="sound"></span></li>`)
    .join("");
  const lis = [...ul.children];
  const nrm = (v, [lo, hi]) => clamp01((v - lo) / (hi - lo));
  const lagT = (L.melt_lag || 10) / (features.sample_fps || 10);

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
    const snow = f.white_frac, earth = f.earth_frac, green = f.green_frac, up = f.green_up_rate;
    const winter = nrm(snow, L.winter_range), spring = nrm(up, L.spring_range), autumn = nrm(up, L.autumn_range);
    const melt = Math.max(0, featuresAt(features, Math.max(0, t - lagT)).white_frac - snow);

    set(0, `Сніг ${pct(snow)}`, snow / (L.winter_range[1] * 1.5),
      winter > 0.8 ? "хуртовина: вітер виє в щілинах" : winter > 0.2 ? `хуртовина слабшає (${pct(winter)})` : "хуртовини немає");
    const season = winter > 0.5 ? "зима" : spring > 0.3 ? "весна: зелень росте" : autumn > 0.3 ? "осінь: зелень спадає" : "літо";
    const wind = winter > 0.5 ? "вітер — хуртовина" : spring > 0.3 ? "дуже легкий теплий вітер" : autumn > 0.3 ? "сухий вітер + дерев'яні клацання" : "теплий вітер";
    const bare = nrm(earth, L.bare_range) > 0.5 ? "; багато голої землі → тихіше" : "";
    set(1, season[0].toUpperCase() + season.slice(1), Math.abs(up - 0.5) * 2, wind + bare);
    const k = green < L.chimes_min ? 0 : Math.round(L.chimes_per_bar[0] + (L.chimes_per_bar[1] - L.chimes_per_bar[0]) * nrm(green, [L.chimes_min, L.chimes_max]));
    set(2, `Зелень ${pct(green)}`, green, k ? `${k} колокольчик${k === 1 ? "" : k < 5 ? "и" : "ів"} на такт, ${green > 0.6 ? "високо й дзвінко" : "нижче й тихіше"}` : "колокольчики мовчать (зелені < 20%)");
    const drips = Math.round(L.drips_per_bar[1] * nrm(melt, L.melt_range));
    set(3, `Сніг тане: −${pct(melt)} за місяць`, nrm(melt, L.melt_range), drips ? `капель: ${drips} крапель на такт` : "капелі немає");
    const birds = (1 - winter) * nrm(green, L.birds_range || [0.3, 0.85]);
    set(4, `Птахи`, birds, winter > 0.5 ? "мовчать (зима)" : birds > 0.6 ? "співають (багато зелені)" : birds > 0.2 ? "трохи птахів" : "майже немає");
    const summer = green >= L.season_split;
    set(5, summer ? "Тональність літа" : "Тональність зими", green, summer ? "фа-мажор, тоніка F (світло)" : "ре-мінор, тоніка D (прохолодно)");
  }

  let n = 0;
  draw(0);
  return (t) => { if (n++ % 4 === 0) draw(t); }; // ~6 разів на секунду
}
