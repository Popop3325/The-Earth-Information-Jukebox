// ІНТЕРФЕЙС: лише те, як усе виглядає й анімується. Правил гри тут немає (вони в main.js).
// Основа — ui.js з архіву команди (scroll-історія: нейрони → планета → орбіта → стрічка часу).
// Зміни: будь-яка кількість нейронів (setNodes), замок/розмиття на canvas з регіоном, без 3D-моделі.
// Клики викликають колбеки, передані в UI.init(): так UI не імпортує main.js (без циклів).
const $ = (id) => document.getElementById(id);

let g, W, H, DPR = 1, el = {}, handlers = {}, introMode = true, storyProgress = 0;
let nodes = [], links = [], sparks = [], pair = null, qOn = false, voiceOn = true, bellTimer = 0, playingNode = null, landingAt = 0;
const mouse = { x: -999, y: -999 };
const stars = Array.from({ length: 150 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.2 + 0.2, s: Math.random() * 2 + 0.5 }));
const BASE_INTRO = [[0.29,0.45],[0.39,0.34],[0.51,0.46],[0.63,0.35],[0.73,0.49],[0.58,0.63]];
// Для n ≤ 6 — позиції з дизайну; більше — «сітка нейронів» по еліпсу з легким розкидом
const introPos = (i, n) => n <= BASE_INTRO.length ? BASE_INTRO[i]
  : [0.5 + Math.cos(-Math.PI / 2 + 2 * Math.PI * i / n) * (0.24 + 0.04 * (i % 3)),
     0.47 + Math.sin(-Math.PI / 2 + 2 * Math.PI * i / n) * (0.17 + 0.03 * ((i + 1) % 2))];
let introLinks = [];
let orbitLinks = [];

function resize() {
  const rect = el.stage.getBoundingClientRect();
  // The canvas is decorative and continuously animated. Full Retina backing
  // stores 4–9× as many pixels on common displays without a visible benefit.
  W = rect.width; H = rect.height; DPR = Math.min(devicePixelRatio || 1, 1.5);
  el.sky.width = W * DPR; el.sky.height = H * DPR; g.setTransform(DPR, 0, 0, DPR, 0, 0);
}
const nodePos = (i, n) => [0.08 + i * (0.84 / Math.max(1, n - 1)), 0.896];
const compactLabel = (label) => {
  const [month, year] = label.toLowerCase().split(/\s+/);
  const shortMonths = { "січень":"січ", "лютий":"лют", "березень":"бер", "квітень":"квіт", "травень":"трав", "червень":"чер", "липень":"лип", "серпень":"серп", "вересень":"вер", "жовтень":"жовт", "листопад":"лист", "грудень":"груд" };
  return shortMonths[month] && year ? `${shortMonths[month]} ’${year.slice(-2)}` : label;
};

function sparkAt(n, count) {
  for (let k = 0; k < count; k++) sparks.push({ x: n.x, y: n.y, vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6, life: 1, h: Math.random() * 360 });
}
const clamp01 = (value) => Math.max(0, Math.min(1, value));
const smoothstep = (value) => { const x = clamp01(value); return x * x * (3 - 2 * x); };
const bez = (p0, p1, p2, p3, u) => { const v = 1 - u; return v*v*v*p0 + 3*v*v*u*p1 + 3*v*u*u*p2 + u*u*u*p3; };
/** Дуга між нейронами: м'яка S-подібна крива (кубічна Безьє), що ледь «дихає»,
 *  зі світінням і світлим імпульсом, який біжить уздовж відкритого зв'язку. */
function drawLink(l, t) {
  const A = nodes[l.a], B = nodes[l.b];
  if (!A || !B) return;
  const u = clamp01(l.p);
  if (!u) return;
  const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;                       // нормаль до відрізка
  const side = l.a % 2 ? -1 : 1;
  const lift = Math.min(64, len * 0.42) * side;              // висота дуги росте з відстанню
  const breathe = Math.sin(t * 1.1 + l.a * 1.7) * Math.min(10, len * 0.06);
  const c1x = A.x + dx * 0.28 + nx * (lift + breathe), c1y = A.y + dy * 0.28 + ny * (lift + breathe);
  const c2x = A.x + dx * 0.72 + nx * (lift * 0.55 - breathe), c2y = A.y + dy * 0.72 + ny * (lift * 0.55 - breathe);
  const steps = Math.max(10, Math.ceil(36 * u));
  g.beginPath();
  for (let k = 0; k <= steps; k++) {
    const s2 = (u * k) / steps;
    const x = bez(A.x, c1x, c2x, B.x, s2), y = bez(A.y, c1y, c2y, B.y, s2);
    k ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  const hue = (l.a * 47 + t * 25) % 360;
  const grad = g.createLinearGradient(A.x, A.y, B.x, B.y);
  grad.addColorStop(0, `hsla(${hue},85%,72%,1)`);
  grad.addColorStop(1, `hsla(${(hue + 70) % 360},85%,72%,1)`);
  const base = g.globalAlpha;
  g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = grad;
  g.globalAlpha = base * 0.16; g.lineWidth = 9; g.stroke();          // м'яке світіння
  g.globalAlpha = base * 0.9; g.lineWidth = 2; g.shadowBlur = 8; g.shadowColor = `hsla(${hue},90%,75%,0.9)`; g.stroke();
  g.shadowBlur = 0;
  if (u >= 1) {                                                       // імпульс біжить по зв'язку
    const s3 = (t * 0.32 + l.a * 0.19) % 1;
    const px = bez(A.x, c1x, c2x, B.x, s3), py = bez(A.y, c1y, c2y, B.y, s3);
    const pg = g.createRadialGradient(px, py, 0, px, py, 7);
    pg.addColorStop(0, "rgba(255,255,255,0.95)"); pg.addColorStop(1, "rgba(255,255,255,0)");
    g.globalAlpha = base; g.fillStyle = pg; g.beginPath(); g.arc(px, py, 7, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = base;
}
function drawNode(n, t) {
  const x0 = n.x + Math.sin(t * 45) * 6 * n.bad;
  const halo = g.createRadialGradient(x0, n.y, 0, x0, n.y, 45);
  const red = Math.round(255 - 120 * n.bad);
  halo.addColorStop(0, `rgba(255,${red},${red},${0.1 + n.glow * 0.6 + n.bad * 0.3})`); halo.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = halo; g.beginPath(); g.arc(x0, n.y, 45, 0, Math.PI * 2); g.fill();
  n.cloud.forEach((p) => {
    const a = p.a + t * 0.2 * p.s, r = p.r * (1 + n.glow * 0.4);
    g.fillStyle = n.bad > 0.1 ? "rgba(255,120,120,0.8)"
      : n.glow > 0.1 ? `hsla(${((p.a * 180 / Math.PI) + t * 60) % 360},90%,80%,0.9)` : "rgba(180,210,255,0.5)";
    g.beginPath(); g.arc(x0 + Math.cos(a) * r, n.y + Math.sin(a) * r * 0.8, 1.5, 0, Math.PI * 2); g.fill();
  });
}
function frame(time) {
  const t = time / 1000;
  g.clearRect(0, 0, W, H); g.fillStyle = "#fff";
  stars.forEach((s) => { g.globalAlpha = 0.2 + 0.4 * Math.sin(t * s.s + s.x * 10) ** 2; g.beginPath(); g.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2); g.fill(); });
  g.globalAlpha = 1;
  // Історія (прокрутка): 0–4% — хмарка нейронів; 4–34% — плавно стягуються в центр планети
  // (лише чверть оберту); 34–72% — одне світне ядро, поки видно назву; 72–96% — розлітаються на стрічку.
  const P = storyProgress;
  const gather = smoothstep((P - 0.04) / 0.30);
  const burst = smoothstep((P - 0.72) / 0.24);
  const merged = gather * (1 - burst);
  const CX = 0.5, CY = 0.49;
  const introLinkFade = 1 - smoothstep((P - 0.02) / 0.12);
  if (introLinkFade > 0.001 && introMode) {
    g.save(); g.globalAlpha = 0.5 * introLinkFade;
    introLinks.forEach((l) => drawLink(l, t));
    g.restore();
  }
  nodes.forEach((n, i) => {
    let x, y;
    if (burst > 0) {
      const arc = Math.sin(burst * Math.PI) * 0.05 * (i % 2 ? 1 : -1);   // легка дуга дорогою
      x = CX + (n.bx - CX) * burst + arc;
      y = CY + (n.by - CY) * burst;
    } else {
      const sx = (n.ix - CX) * W, sy = (n.iy - CY) * H;
      const ang = Math.atan2(sy, sx) + gather * Math.PI * 0.35;
      const rad = Math.hypot(sx, sy) * (1 - gather);
      x = CX + (Math.cos(ang) * rad) / W;
      y = CY + (Math.sin(ang) * rad) / H;
    }
    const wobble = 7 * (1 - merged);
    let tx = x * W + Math.sin(t * 0.5 + i) * wobble, ty = y * H + Math.cos(t * 0.4 + i * 1.5) * wobble;
    if (merged < 0.5) {
      const dx = tx - mouse.x, dy = ty - mouse.y, d = Math.hypot(dx, dy);
      if (d < 130 && d > 0) { const f = (130 - d) / 130 * 30; tx += dx / d * f; ty += dy / d * f; }
    }
    const follow = burst > 0 && burst < 1 ? 0.2 : 0.12;
    n.x += (tx - n.x) * follow; n.y += (ty - n.y) * follow;
    if (n.active) n.glow = Math.max(n.glow, 0.48);
    if (playingNode === n.i) n.glow = Math.max(n.glow, 0.92);
    n.glow = Math.max(0, n.glow - 0.02); n.bad = Math.max(0, n.bad - 0.02);
    n.el.style.transform = `translate(${n.x}px, ${n.y}px)`;
  });
  if (merged > 0.02) {                                                   // ядро: усі нейрони в одній точці
    const R = Math.min(W, H) * 0.07 * (1 + 0.12 * Math.sin(t * 2.2));
    const cg = g.createRadialGradient(CX * W, CY * H, 0, CX * W, CY * H, R);
    cg.addColorStop(0, "rgba(255,255,255,0.95)"); cg.addColorStop(0.35, "rgba(255,226,140,0.55)"); cg.addColorStop(1, "rgba(255,213,79,0)");
    g.save(); g.globalAlpha = merged; g.fillStyle = cg; g.beginPath(); g.arc(CX * W, CY * H, R, 0, Math.PI * 2); g.fill(); g.restore();
  }
  links.forEach((l) => { l.p = Math.min(1, l.p + 0.03); drawLink(l, t); });
  nodes.forEach((n) => drawNode(n, t));
  sparks = sparks.filter((p) => p.life > 0);
  sparks.forEach((p) => { p.x += p.vx; p.y += p.vy; p.life -= 0.03; g.fillStyle = `hsla(${p.h},90%,80%,${p.life})`; g.beginPath(); g.arc(p.x, p.y, 2, 0, Math.PI * 2); g.fill(); });
  requestAnimationFrame(frame);
}

export const UI = {
  video: () => el.video,

  /** labels: підписи нейронів; onPick(i) / onListen(i) / onBell() / onVoiceToggle: колбеки гри */
  init(labels, cb) {
    handlers = cb;
    el = { sky: $("sky"), stage: document.querySelector(".neuron-stage"), video: $("video"), view: $("view"), overlay: $("screen-overlay"), text: $("overlay-text"), btn: $("overlay-btn"),
      caption: $("caption"), bellBox: $("bell-box"), bellIcon: $("bell-icon"), q: $("q-float"), box: $("nodes"),
      live: $("announce"), hint: $("hint"), voice: $("voice-toggle"), score: $("score") };
    g = el.sky.getContext("2d"); resize();
    const nasaEarth = $("earth-model");
    const showNasaEarth = () => $("earth-orb").classList.add("model-ready");
    if (nasaEarth?.loaded) showNasaEarth();
    nasaEarth?.addEventListener("load", showNasaEarth, { once:true });
    const shell = $("game-shell"), sticky = document.querySelector(".story-sticky"), track = $("story-track");
    const updateStory = () => {
      const maxScroll = Math.max(1, track.offsetHeight - innerHeight);
      storyProgress = clamp01(scrollY / maxScroll);
      const mapReveal = smoothstep((storyProgress - 0.78) / 0.19);
      const planetIntro = smoothstep((storyProgress - 0.04) / 0.34);
      const titleOpacity = planetIntro * (1 - smoothstep((storyProgress - 0.55) / 0.2)) * (1 - mapReveal);
      const titleMode = storyProgress >= 0.04 && storyProgress < 0.99;
      const appMode = storyProgress >= 0.78;
      shell.classList.toggle("intro-mode", !appMode);
      sticky.classList.toggle("story-title-mode", titleMode);
      sticky.classList.toggle("story-app-mode", appMode);
      shell.classList.toggle("story-app-mode", appMode);
      sticky.style.setProperty("--map-reveal", mapReveal.toFixed(3));
      sticky.style.setProperty("--planet-intro", planetIntro.toFixed(3));
      sticky.style.setProperty("--title-opacity", titleOpacity.toFixed(3));
      introMode = !appMode;
      if (appMode) landingAt = performance.now() - 3500;
    };
    addEventListener("scroll", updateStory, { passive:true });
    addEventListener("resize", updateStory);
    updateStory();
    addEventListener("resize", resize);
    addEventListener("pointermove", (e) => {
      const r = el.stage.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
    });
    el.voice.onclick = () => UI.toggleVoice();
    el.bellBox.onclick = () => handlers.onBell();
    document.querySelectorAll("[data-track-volume]").forEach((input) => {
      const track = input.dataset.trackVolume, enabled = document.querySelector(`[data-track-enabled="${track}"]`);
      const output = input.parentElement.querySelector("output");
      const update = () => {
        output.value = `${input.value}%`;
        handlers.onTrack?.(track, Number(input.value) / 100, enabled.checked);
      };
      input.addEventListener("input", update);
      enabled.addEventListener("change", update);
      update();
    });
    UI.setNodes(labels);
    requestAnimationFrame(frame);
  },

  /** Перебудувати нейрони під новий регіон (інша кількість періодів) */
  setNodes(labels) {
    el.box.innerHTML = ""; links = []; pair = null; qOn = false; playingNode = null;
    const n = labels.length;
    nodes = labels.map((p, i) => {
      const [bx, by] = nodePos(i, n), [ix, iy] = introPos(i, n);
      const node = { i, bx, by, ix, iy, x: W * ix, y: H * iy, glow: 0, bad: 0,
        cloud: Array.from({ length: 50 }, () => ({ a: Math.random() * Math.PI * 2, r: Math.pow(Math.random(), 0.6) * (n > 8 ? 26 : 35), s: Math.random() * 0.8 + 0.2 })) };
      const wrap = document.createElement("div"); wrap.className = "node-wrap";
      const hit = document.createElement("button"); hit.type = "button"; hit.className = "node-hitbox";
      hit.setAttribute("aria-label", "Прослухати: " + p);
      const ui = document.createElement("div"); ui.className = "node-ui";
      const lbl = document.createElement("div"); lbl.className = "node-lbl"; lbl.textContent = compactLabel(p);
      hit.onclick = () => {
        if (qOn && pair && (i === pair[0] || i === pair[1])) handlers.onPick(i);
        else handlers.onListen(i);
      };
      ui.append(lbl); wrap.append(hit, ui); el.box.appendChild(wrap); node.el = wrap; node.hit = hit; node.label = p; return node;
    });
    orbitLinks = nodes.map((_, i) => ({ a:i, b:(i + 1) % n, p:1 }));
    introLinks = nodes.map((_, i) => ({ a:i, b:(i + (i % 2 ? 2 : 1)) % n, p:1 })).filter((l) => l.a !== l.b);
  },

  animateIntro() {
    const shell = $("game-shell"), beganAt = performance.now();
    let scheduled = false, fallbackTimer;
    const land = () => {
      if (scheduled) return;
      scheduled = true;
      clearTimeout(fallbackTimer);
      const minIntro = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 2300;
      setTimeout(() => {
        introMode = false;
        landingAt = performance.now();
        shell.classList.remove("intro-mode");
      }, Math.max(0, minIntro - (performance.now() - beganAt)));
    };
    if (el.video.readyState >= 2) land();
    else {
      el.video.addEventListener("loadeddata", land, { once:true });
      fallbackTimer = setTimeout(land, 4200);
    }
  },

  showPair(a, b) {
    pair = [a, b];
    nodes.forEach((n, i) => {
      const active = i === a || i === b;
      n.active = active;
      if (active) n.glow = Math.max(n.glow, 0.78);
      n.el.classList.toggle("is-current", active);
      n.hit.setAttribute("aria-label", `${active ? "Обрати відповідь" : "Прослухати рік"}: ${n.label}`);
    });
  },
  showQuestion(text) { el.q.textContent = text; el.q.classList.remove("hidden"); qOn = true; },
  hideQuestion() {
    el.q.classList.add("hidden"); qOn = false;
    nodes.forEach((n) => n.hit.setAttribute("aria-label", `Прослухати рік: ${n.label}`));
  },
  showHint(text) { el.hint.textContent = text || ""; el.hint.classList.toggle("visible", !!text); if (text) UI.announce(text); },
  setScore(text) { el.score.textContent = text || ""; },
  wrong(i) { nodes[i].bad = 1; },
  link(a, b) { sparkAt(nodes[a], 20); sparkAt(nodes[b], 20); nodes[a].glow = nodes[b].glow = 1; links.push({ a, b, p: 0 }); },
  setPlaying(i, on) {
    if (on) playingNode = i;
    else if (playingNode === i) playingNode = null;
    if (on) nodes[i].glow = 1;
    nodes.forEach((n, idx) => n.el.classList.toggle("playing", idx === playingNode));
  },

  unlockScreen(caption) {
    el.overlay.classList.add("hidden"); (el.view || el.video).classList.remove("locked");
    el.caption.textContent = caption; el.caption.classList.add("visible");
    UI.hideQuestion(); UI.showBell(false);
  },
  lockScreen() { (el.view || el.video).classList.add("locked"); el.caption.classList.remove("visible"); },
  setCaption(text) { el.caption.textContent = text; el.caption.classList.toggle("visible", !!text); },
  showBell(on) { el.bellBox.classList.toggle("hidden", !on); },
  ringBell() {
    clearTimeout(bellTimer); el.bellIcon.classList.remove("ringing"); void el.bellIcon.offsetWidth;
    el.bellIcon.classList.add("ringing"); bellTimer = setTimeout(() => el.bellIcon.classList.remove("ringing"), 2500);
  },
  showMessage(text, btnText, onClick) {
    el.text.textContent = text;
    if (btnText) { el.btn.textContent = btnText; el.btn.style.display = "inline-block"; el.btn.onclick = onClick; } else el.btn.style.display = "none";
    el.overlay.classList.remove("hidden");
  },
  hideMessage() { el.overlay.classList.add("hidden"); },

  announce(text) { el.live.textContent = ""; setTimeout(() => (el.live.textContent = text), 30); },
  /** Озвучити текст. Promise завершується, коли фразу договорено (або одразу, якщо озвучення вимкнене).
   *  Так гра може вести незрячу людину крок за кроком: сказала → зіграла → чекає відповідь. */
  speak(text) {
    if (!voiceOn || !("speechSynthesis" in window)) return Promise.resolve();
    speechSynthesis.cancel();
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "uk-UA"; u.rate = 1.0;
      const done = () => { clearTimeout(guard); resolve(); };
      const guard = setTimeout(done, 1500 + text.length * 90);   // на випадок, якщо onend не прийде
      u.onend = done; u.onerror = done;
      speechSynthesis.speak(u);
    });
  },
  voiceOn: () => voiceOn,
  stopSpeak() { if ("speechSynthesis" in window) speechSynthesis.cancel(); },
  toggleVoice() {
    voiceOn = !voiceOn; el.voice.textContent = voiceOn ? "🔊" : "🔇";
    el.voice.setAttribute("aria-label", voiceOn ? "Вимкнути озвучення" : "Увімкнути озвучення");
    if (!voiceOn) UI.stopSpeak();
  },
};
