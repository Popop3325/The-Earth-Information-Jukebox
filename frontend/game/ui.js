// ІНТЕРФЕЙС ГРИ: лише те, як усе виглядає й анімується. Правил гри тут немає.
// Візуал узято з prototype/index.html (зоряне небо, нейрони-хмарки, зв'язки, іскри, розмиття відео).
// Клики викликають колбеки, передані в UI.init(): так UI не імпортує game.js (без циклів).
const $ = (id) => document.getElementById(id);

let g, W, H, DPR = 1, el = {}, handlers = {};
let nodes = [], links = [], sparks = [], pair = null, qOn = false, voiceOn = true, bellTimer = 0;
const mouse = { x: -999, y: -999 };
const stars = Array.from({ length: 150 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.2 + 0.2, s: Math.random() * 2 + 0.5 }));

function resize() {
  W = innerWidth; H = innerHeight; DPR = devicePixelRatio || 1;
  el.sky.width = W * DPR; el.sky.height = H * DPR; g.setTransform(DPR, 0, 0, DPR, 0, 0);
}
const nodePos = (i, n) => [0.15 + i * (0.70 / Math.max(1, n - 1)), i % 2 === 0 ? 0.78 : 0.52];

function sparkAt(n, count) {
  for (let k = 0; k < count; k++) sparks.push({ x: n.x, y: n.y, vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6, life: 1, h: Math.random() * 360 });
}
function drawLink(l, t) {
  const A = nodes[l.a], B = nodes[l.b];
  const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1;
  const cx = (A.x + B.x) / 2 - dy / len * 30, cy = (A.y + B.y) / 2 + dx / len * 30;
  const steps = 30, end = Math.floor(steps * l.p);
  g.lineWidth = 2.5; g.shadowBlur = 15;
  for (let k = 1; k <= end; k++) {
    const u0 = (k - 1) / steps, u1 = k / steps, v0 = 1 - u0, v1 = 1 - u1;
    const p0 = { x: v0*v0*A.x + 2*v0*u0*cx + u0*u0*B.x, y: v0*v0*A.y + 2*v0*u0*cy + u0*u0*B.y };
    const p1 = { x: v1*v1*A.x + 2*v1*u1*cx + u1*u1*B.x, y: v1*v1*A.y + 2*v1*u1*cy + u1*u1*B.y };
    const hue = (l.a * 50 + t * 40 + k * 4) % 360;
    g.strokeStyle = `hsla(${hue},90%,75%,0.9)`; g.shadowColor = `hsla(${hue},90%,75%,1)`;
    g.beginPath(); g.moveTo(p0.x, p0.y); g.lineTo(p1.x, p1.y); g.stroke();
  }
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
  nodes.forEach((n, i) => {
    let tx = n.bx * W + Math.sin(t * 0.5 + i) * 12, ty = n.by * H + Math.cos(t * 0.4 + i * 1.5) * 12;
    const dx = tx - mouse.x, dy = ty - mouse.y, d = Math.hypot(dx, dy);
    if (d < 130 && d > 0) { const f = (130 - d) / 130 * 30; tx += dx / d * f; ty += dy / d * f; }
    n.x += (tx - n.x) * 0.1; n.y += (ty - n.y) * 0.1;
    n.glow = Math.max(0, n.glow - 0.02); n.bad = Math.max(0, n.bad - 0.02);
    n.el.style.transform = `translate(${n.x}px, ${n.y}px)`;
  });
  if (pair && qOn) {
    const [a, b] = pair, mx = (nodes[a].x + nodes[b].x) / 2, my = Math.min(nodes[a].y, nodes[b].y) - 50;
    el.q.style.left = mx + "px"; el.q.style.top = Math.max(H * 0.35, my) + "px";
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
    el = { sky: $("sky"), video: $("video"), overlay: $("screen-overlay"), text: $("overlay-text"), btn: $("overlay-btn"),
      caption: $("caption"), bellBox: $("bell-box"), bellIcon: $("bell-icon"), q: $("q-float"), box: $("nodes"),
      live: $("announce"), hint: $("hint"), voice: $("voice-toggle"), score: $("score") };
    g = el.sky.getContext("2d"); resize();
    addEventListener("resize", resize);
    addEventListener("pointermove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
    el.voice.onclick = () => UI.toggleVoice();
    el.bellBox.onclick = () => handlers.onBell();
    nodes = labels.map((p, i) => {
      const [bx, by] = nodePos(i, labels.length);
      const n = { i, bx, by, x: W * bx, y: H * by, glow: 0, bad: 0,
        cloud: Array.from({ length: 50 }, () => ({ a: Math.random() * Math.PI * 2, r: Math.pow(Math.random(), 0.6) * 35, s: Math.random() * 0.8 + 0.2 })) };
      const wrap = document.createElement("div"); wrap.className = "node-wrap hidden-ui";
      const hit = document.createElement("button"); hit.type = "button"; hit.className = "node-hitbox";
      hit.setAttribute("aria-label", "Обрати: " + p); hit.onclick = () => handlers.onPick(i);
      const ui = document.createElement("div"); ui.className = "node-ui";
      const lbl = document.createElement("div"); lbl.className = "node-lbl"; lbl.textContent = p;
      const play = document.createElement("button"); play.type = "button"; play.className = "node-play";
      play.textContent = "🔊 Слухати"; play.setAttribute("aria-label", "Слухати звук: " + p);
      play.onclick = (e) => { e.stopPropagation(); handlers.onListen(i); };
      ui.append(lbl, play); wrap.append(hit, ui); el.box.appendChild(wrap); n.el = wrap; return n;
    });
    requestAnimationFrame(frame);
  },

  showPair(a, b) { pair = [a, b]; nodes.forEach((n, i) => n.el.classList.toggle("hidden-ui", !(i === a || i === b))); },
  showQuestion(text) { el.q.textContent = text; el.q.classList.remove("hidden"); qOn = true; },
  hideQuestion() { el.q.classList.add("hidden"); qOn = false; },
  showHint(text) { el.hint.textContent = text || ""; el.hint.classList.toggle("visible", !!text); if (text) UI.announce(text); },
  setScore(text) { el.score.textContent = text || ""; },
  wrong(i) { nodes[i].bad = 1; },
  link(a, b) { sparkAt(nodes[a], 20); sparkAt(nodes[b], 20); nodes[a].glow = nodes[b].glow = 1; links.push({ a, b, p: 0 }); },

  unlockScreen(caption) {
    el.overlay.classList.add("hidden"); el.video.classList.remove("locked");
    el.caption.textContent = caption; el.caption.classList.add("visible");
    nodes.forEach((n) => n.el.classList.add("hidden-ui")); UI.hideQuestion(); UI.showBell(false);
  },
  lockScreen() { el.video.classList.add("locked"); el.caption.classList.remove("visible"); },
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
    voiceOn = !voiceOn; el.voice.textContent = (voiceOn ? "🔊" : "🔇") + " Озвучення (CapsLock)";
    if (!voiceOn) UI.stopSpeak();
  },
};