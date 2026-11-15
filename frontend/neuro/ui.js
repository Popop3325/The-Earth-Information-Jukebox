// ІНТЕРФЕЙС: лише те, як усе виглядає й анімується. Правил гри тут немає (вони в main.js).
// Основа — ui.js з архіву команди. Зараз: планета з назвою → одна прокрутка → відео й стрічка нейронів.
// Клики викликають колбеки, передані в UI.init(): так UI не імпортує main.js (без циклів).
const $ = (id) => document.getElementById(id);

let g, W, H, DPR = 1, el = {}, handlers = {};
let nodes = [], links = [], sparks = [], pair = null, qOn = false, voiceOn = true, bellTimer = 0, playingNode = null;
const mouse = { x: -999, y: -999 };
const PULL_R = 120;   // радіус, у якому нейрон тягнеться до курсора
const stars = Array.from({ length: 150 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.2 + 0.2, s: Math.random() * 2 + 0.5 }));

function resize() {
  const rect = el.stage.getBoundingClientRect();
  // The canvas is decorative and continuously animated. Full Retina backing
  // stores 4–9× as many pixels on common displays without a visible benefit.
  W = rect.width; H = rect.height; DPR = Math.min(devicePixelRatio || 1, 1.5);
  el.sky.width = W * DPR; el.sky.height = H * DPR; g.setTransform(DPR, 0, 0, DPR, 0, 0);
}
// Стрічка часу — у нижній смузі (--band у neuro.css = 28% висоти)
const nodePos = (i, n) => [0.08 + i * (0.84 / Math.max(1, n - 1)), 0.875];
/** «Dec 2023» → «Dec ’23» */
const compactLabel = (label) => { const [m, y] = label.split(/\s+/); return y ? `${m} ’${y.slice(-2)}` : label; };

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
  // Нейрони живуть лише на стрічці часу (без вступної анімації). Біля курсора вони м'яко
  // ПРИТЯГУЮТЬСЯ до нього (а не відштовхуються), тож у них легко влучити.
  nodes.forEach((n, i) => {
    let tx = n.bx * W + Math.sin(t * 0.5 + i) * 4, ty = n.by * H + Math.cos(t * 0.4 + i * 1.5) * 4;
    const dx = mouse.x - tx, dy = mouse.y - ty, d = Math.hypot(dx, dy);
    if (n.active && d < PULL_R) { const k = (1 - d / PULL_R) * 0.45; tx += dx * k; ty += dy * k; }
    n.x += (tx - n.x) * 0.14; n.y += (ty - n.y) * 0.14;
    if (n.active) n.glow = Math.max(n.glow, 0.48);
    if (playingNode === n.i) n.glow = Math.max(n.glow, 0.92);
    n.glow = Math.max(0, n.glow - 0.02); n.bad = Math.max(0, n.bad - 0.02);
    n.el.style.transform = `translate(${n.x}px, ${n.y}px)`;
  });
  links.forEach((l) => { l.p = Math.min(1, l.p + 0.03); drawLink(l, t); });
  nodes.forEach((n) => drawNode(n, t));
  sparks = sparks.filter((p) => p.life > 0);
  sparks.forEach((p) => { p.x += p.vx; p.y += p.vy; p.life -= 0.03; g.fillStyle = `hsla(${p.h},90%,80%,${p.life})`; g.beginPath(); g.arc(p.x, p.y, 2, 0, Math.PI * 2); g.fill(); });
  requestAnimationFrame(frame);
}

export const UI = {
  video: () => el.video,

  /** labels: підписи нейронів (англ., «Dec 2023»); колбеки гри: onPick(i), onListen(i), onBell(), onTrack(), onEnterGame() */
  init(labels, cb) {
    handlers = cb;
    el = { sky: $("sky"), stage: document.querySelector(".neuron-stage"), video: $("video"), view: $("view"), overlay: $("screen-overlay"), text: $("overlay-text"), btn: $("overlay-btn"),
      caption: $("caption"), bellBox: $("bell-box"), bellIcon: $("bell-icon"), q: $("q-float"), box: $("nodes"),
      live: $("announce"), hint: $("hint"), voice: $("voice-toggle"), score: $("score") };
    g = el.sky.getContext("2d"); resize();
    // Одна прокрутка: планета з назвою → (свайп) → відео й гра. Без вступної анімації нейронів.
    const shell = $("game-shell"), sticky = document.querySelector(".story-sticky"), track = $("story-track");
    let wasApp = false;
    const updateStory = () => {
      const maxScroll = Math.max(1, track.offsetHeight - innerHeight);
      const P = clamp01(scrollY / maxScroll);
      const mapReveal = smoothstep((P - 0.2) / 0.65);
      const titleOpacity = 1 - smoothstep(P / 0.4);
      const appMode = P >= 0.55;
      shell.classList.toggle("intro-mode", !appMode);
      sticky.classList.toggle("story-title-mode", !appMode);
      sticky.classList.toggle("story-app-mode", appMode);
      shell.classList.toggle("story-app-mode", appMode);
      sticky.style.setProperty("--map-reveal", mapReveal.toFixed(3));
      sticky.style.setProperty("--planet-intro", "1");
      sticky.style.setProperty("--title-opacity", titleOpacity.toFixed(3));
      if (appMode && !wasApp) { resize(); handlers.onEnterGame?.(); }
      wasApp = appMode;
    };
    addEventListener("scroll", updateStory, { passive:true });
    addEventListener("resize", updateStory);
    updateStory();
    addEventListener("resize", resize);
    addEventListener("pointermove", (e) => {
      const r = el.stage.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
    });
    document.addEventListener("pointerleave", () => { mouse.x = mouse.y = -999; });
    el.voice.onclick = () => UI.toggleVoice();
    el.bellBox.onclick = (e) => { if (e.detail) el.bellBox.blur(); handlers.onBell(); };
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

  /** Перебудувати нейрони (новий регіон). labels — короткі («Dec 2023»), full — для озвучення («December 2023») */
  setNodes(labels, full = labels) {
    el.box.innerHTML = ""; links = []; pair = null; qOn = false; playingNode = null;
    const n = labels.length;
    nodes = labels.map((p, i) => {
      const [bx, by] = nodePos(i, n);
      const node = { i, bx, by, x: W * bx, y: H * by, glow: 0, bad: 0, label: full[i],
        cloud: Array.from({ length: 50 }, () => ({ a: Math.random() * Math.PI * 2, r: Math.pow(Math.random(), 0.6) * (n > 8 ? 26 : 35), s: Math.random() * 0.8 + 0.2 })) };
      const wrap = document.createElement("div"); wrap.className = "node-wrap";
      const hit = document.createElement("button"); hit.type = "button"; hit.className = "node-hitbox";
      hit.setAttribute("aria-label", `Listen to ${full[i]}`);
      const ui = document.createElement("div"); ui.className = "node-ui";
      const lbl = document.createElement("div"); lbl.className = "node-lbl"; lbl.textContent = compactLabel(p);
      const play = document.createElement("button"); play.type = "button"; play.className = "node-play";
      play.innerHTML = '<span aria-hidden="true">▶</span> Listen'; play.setAttribute("aria-label", `Listen to ${full[i]}`);
      play.onclick = (e) => { if (e.detail) play.blur(); handlers.onListen(i); };
      hit.onclick = (e) => {
        if (e.detail) hit.blur();            // клік мишею: фокус не лишається на нейроні
        if (!nodes[i].active) return;        // сірі (неактивні) нейрони не реагують
        if (qOn) handlers.onPick(i); else handlers.onListen(i);
      };
      ui.append(lbl); wrap.append(hit, ui, play); el.box.appendChild(wrap); node.el = wrap; node.hit = hit; return node;
    });
  },

  showPair(a, b) {
    pair = [a, b];
    nodes.forEach((n, i) => {
      const active = i === a || i === b;
      n.active = active;
      if (active) n.glow = Math.max(n.glow, 0.78);
      n.el.classList.toggle("is-current", active);
    });
    UI.refreshLabels();
  },
  refreshLabels() {
    nodes.forEach((n) => {
      n.hit.disabled = !n.active;          // неактивні: не клікаються й не отримують фокус
      n.hit.setAttribute("aria-label", `${qOn && n.active ? "Choose" : "Listen to"} ${n.label}`);
    });
  },
  showQuestion(text) { el.q.textContent = text; el.q.classList.remove("hidden"); qOn = true; UI.refreshLabels(); },
  hideQuestion() { el.q.classList.add("hidden"); qOn = false; UI.refreshLabels(); },
  showHint(text) { el.hint.textContent = text || ""; el.hint.classList.toggle("visible", !!text); },
  setScore(text) { el.score.textContent = text || ""; },
  wrong(i) { nodes[i].bad = 1; },
  link(a, b) {
    if (links.some((l) => l.a === a && l.b === b)) return;
    sparkAt(nodes[a], 20); sparkAt(nodes[b], 20); nodes[a].glow = nodes[b].glow = 1; links.push({ a, b, p: 0 });
  },
  setPlaying(i, on) {
    if (on) playingNode = i;
    else if (playingNode === i) playingNode = null;
    if (on) nodes[i].glow = 1;
    nodes.forEach((n, idx) => n.el.classList.toggle("playing", idx === playingNode));
  },

  unlockScreen(caption) {
    el.overlay.classList.add("hidden"); (el.view || el.video).classList.remove("locked");
    el.caption.textContent = caption; el.caption.classList.add("visible");
    UI.hideQuestion();
  },
  lockScreen() { (el.view || el.video).classList.add("locked"); el.caption.classList.remove("visible"); },
  setCaption(text) { el.caption.textContent = text; el.caption.classList.toggle("visible", !!text); },
  showBell(on) { el.bellBox.classList.toggle("hidden", !on); },
  /** Удар дзвіночка: іконка гойдається, кнопка м'яко світиться */
  ringBell() {
    clearTimeout(bellTimer);
    for (const x of [el.bellIcon, el.bellBox]) { x.classList.remove("ringing"); void x.offsetWidth; x.classList.add("ringing"); }
    bellTimer = setTimeout(() => { el.bellIcon.classList.remove("ringing"); el.bellBox.classList.remove("ringing"); }, 3000);
  },
  showMessage(text, btnText, onClick) {
    el.text.textContent = text;
    if (btnText) { el.btn.textContent = btnText; el.btn.style.display = "inline-block"; el.btn.onclick = onClick; } else el.btn.style.display = "none";
    el.overlay.classList.remove("hidden");
  },
  hideMessage() { el.overlay.classList.add("hidden"); },

  announce(text) { el.live.textContent = ""; setTimeout(() => (el.live.textContent = text), 30); },
  /** Озвучити текст англійською. Promise завершується, коли фразу договорено (або одразу, якщо озвучення вимкнене). */
  speak(text) {
    if (!voiceOn || !("speechSynthesis" in window)) return Promise.resolve();
    speechSynthesis.cancel();
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US"; u.rate = 1.0;
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
    el.voice.setAttribute("aria-label", voiceOn ? "Turn voice off" : "Turn voice on");
    el.voice.setAttribute("aria-pressed", String(voiceOn));
    if (!voiceOn) UI.stopSpeak();
  },
};
