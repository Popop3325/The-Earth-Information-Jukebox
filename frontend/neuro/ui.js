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
function drawLink(l, t) {
  const A = nodes[l.a], B = nodes[l.b];
  const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1;
  const cx = (A.x + B.x) / 2 - dy / len * 30, cy = (A.y + B.y) / 2 + dx / len * 30;
  const u = clamp01(l.p), v = 1 - u;
  if (!u) return;
  // De Casteljau gives the exact control point and endpoint for the visible
  // fraction of the curve, so progressive links stay smooth with one stroke.
  const px = v*v*A.x + 2*v*u*cx + u*u*B.x;
  const py = v*v*A.y + 2*v*u*cy + u*u*B.y;
  const qx = A.x + (cx - A.x) * u, qy = A.y + (cy - A.y) * u;
  const hue = (l.a * 50 + t * 40) % 360;
  const gradient = g.createLinearGradient(A.x, A.y, B.x, B.y);
  gradient.addColorStop(0, `hsla(${hue},90%,75%,0.9)`);
  gradient.addColorStop(1, `hsla(${(hue + 90) % 360},90%,75%,0.9)`);
  g.lineWidth = 2.5; g.shadowBlur = 10; g.shadowColor = `hsla(${hue},90%,75%,0.8)`;
  g.strokeStyle = gradient; g.beginPath(); g.moveTo(A.x, A.y); g.quadraticCurveTo(qx, qy, px, py); g.stroke();
  g.shadowBlur = 0;
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
  const landingProgress = landingAt ? Math.min(1, (performance.now() - landingAt) / 3500) : 0;
  const exitProgress = smoothstep((storyProgress - 0.63) / 0.28);
  const introLinkFade = 1 - smoothstep((storyProgress - 0.04) / 0.11);
  const orbitRingFade = smoothstep((storyProgress - 0.31) / 0.11)
    * (1 - smoothstep((storyProgress - 0.63) / 0.14));
  if (introMode || storyProgress < 0.99 || landingProgress < 1) {
    g.save(); g.globalAlpha = 0.48 * introLinkFade * (introMode ? 1 : 1 - landingProgress);
    introLinks.forEach((l) => drawLink(l, t));
    g.restore();
  }
  nodes.forEach((n, i) => {
    let x = introMode ? n.ix : n.bx, y = introMode ? n.iy : n.by;
    const count = Math.max(1, nodes.length), orbitRadius = Math.min(W, H) * 0.45;
    const orbitAngle = -Math.PI / 2 + Math.PI * 2 * i / count;
    const spinOffset = t * 0.12;
    if (storyProgress >= 0.04 && storyProgress < 0.38) {
      const capture = smoothstep((storyProgress - 0.04) / 0.34);
      const startDx = (n.ix - 0.5) * W, startDy = (n.iy - 0.49) * H;
      const startAngle = Math.atan2(startDy, startDx);
      const startRadius = Math.hypot(startDx, startDy);
      const captureAngle = startAngle + (orbitAngle - Math.PI * 2 - startAngle) * capture - spinOffset * capture;
      const captureRadius = startRadius + (orbitRadius - startRadius) * capture;
      x = 0.5 + Math.cos(captureAngle) * captureRadius / W;
      y = 0.49 + Math.sin(captureAngle) * captureRadius / H;
    } else if (storyProgress >= 0.38 && storyProgress < 0.63) {
      const orbitTurn = smoothstep((storyProgress - 0.38) / 0.25) * Math.PI * 0.7;
      const angle = orbitAngle - Math.PI * 2 - orbitTurn - spinOffset;
      x = 0.5 + Math.cos(angle) * orbitRadius / W;
      y = 0.49 + Math.sin(angle) * orbitRadius / H;
    } else if (storyProgress >= 0.63 && storyProgress < 0.91) {
      const angle = orbitAngle - Math.PI * 2 - Math.PI * 0.7 - exitProgress * Math.PI * 2 - spinOffset;
      // Keep the neurons spread while they spiral down; collapsing to radius 0
      // made them bunch into one bright knot just before the timeline appeared.
      const radius = orbitRadius * (1 - exitProgress * 0.78);
      const centerY = 0.49 + 0.28 * exitProgress;
      x = 0.5 + Math.cos(angle) * radius / W;
      y = centerY + Math.sin(angle) * radius / H;
    } else if (storyProgress >= 0.91) {
      const fan = smoothstep((storyProgress - 0.91) / 0.09);
      // Carry the counter-clockwise motion into the landing arc, then let each
      // neuron settle onto its own point along the timeline.
      const angle = orbitAngle - Math.PI * 2 - Math.PI * 0.7 - Math.PI * 2 - spinOffset - fan * Math.PI * 0.65;
      const radius = orbitRadius * (0.22 - 0.12 * fan);
      const spiralX = 0.5 + Math.cos(angle) * radius / W;
      const spiralY = 0.77 + Math.sin(angle) * radius / H;
      x = spiralX + (n.bx - spiralX) * fan;
      y = spiralY + (n.by - spiralY) * fan;
    }
    let tx = x * W + Math.sin(t * 0.5 + i) * 7, ty = y * H + Math.cos(t * 0.4 + i * 1.5) * 7;
    const dx = tx - mouse.x, dy = ty - mouse.y, d = Math.hypot(dx, dy);
    if (d < 130 && d > 0) { const f = (130 - d) / 130 * 30; tx += dx / d * f; ty += dy / d * f; }
    const follow = introMode ? 0.07 : 0.022;
    n.x += (tx - n.x) * follow; n.y += (ty - n.y) * follow;
    if (n.active) n.glow = Math.max(n.glow, 0.48);
    if (playingNode === n.i) n.glow = Math.max(n.glow, 0.92);
    n.glow = Math.max(0, n.glow - 0.02); n.bad = Math.max(0, n.bad - 0.02);
    n.el.style.transform = `translate(${n.x}px, ${n.y}px)`;
  });
  links.forEach((l) => { l.p = Math.min(1, l.p + 0.03); drawLink(l, t); });
  if (orbitRingFade > 0.001) {
    g.save(); g.globalAlpha = 0.62 * orbitRingFade;
    orbitLinks.forEach((l) => drawLink(l, t));
    g.restore();
  }
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
  speak(text) {
    if (!voiceOn || !("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); u.lang = "uk-UA"; u.rate = 1.0; speechSynthesis.speak(u);
  },
  stopSpeak() { if ("speechSynthesis" in window) speechSynthesis.cancel(); },
  toggleVoice() {
    voiceOn = !voiceOn; el.voice.textContent = voiceOn ? "🔊" : "🔇";
    el.voice.setAttribute("aria-label", voiceOn ? "Вимкнути озвучення" : "Увімкнути озвучення");
    if (!voiceOn) UI.stopSpeak();
  },
};
