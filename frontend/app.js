// Джукбокс: список відео → відео + звук з партитури. Звук: player.js
import { ScorePlayer } from "./player.js";

const $ = (id) => document.getElementById(id);
const video = $("video");
const statusEl = $("status");
const presetSel = $("preset");
let current = null; // { video meta }
let player = null;
let clockStart = 0; // якщо відео немає — звук іде за власним таймером

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

const hasVideo = () => !!video.getAttribute("src");
const nowT = (score) => (hasVideo() ? video.currentTime : (Tone.now() - clockStart) % score.duration_s);

let loadToken = 0;

async function loadScore() {
  const token = ++loadToken;
  const wasPlaying = player?.playing;
  player?.dispose();
  player = null; // поки новий не завантажився, кнопки нічого не запускають
  const preset = presetSel.value ? `?preset=${presetSel.value}` : "";
  const score = await getJSON(`/api/score/${current.id}${preset}`);
  const p = new ScorePlayer(score, { getTime: () => nowT(score), getRate: () => (hasVideo() ? video.playbackRate : 1) });
  p.onTick = (t) => {
    const layers = p.layers.map((l) => `${l.id} ${(p.layerGain(l.id, t) * 100).toFixed(0)}%`).join(" · ");
    statusEl.textContent = `t=${t.toFixed(1)}s · ${score.preset}${layers ? " · " + layers : ""}`;
  };
  await p.load();
  if (token !== loadToken) return p.dispose(); // за цей час користувач обрав інше
  player = p;
  if (wasPlaying) player.start(); // зміна пресету під час гри не зупиняє звук
  $("video-note").textContent =
    (score.is_sample ? "⚠ Фічі ще не пораховано, звучать демо-дані. " : "") +
    (hasVideo() ? "" : "Відео не знайдено: звук іде за таймером. ");
}

async function selectVideo(v, button) {
  document.querySelectorAll(".video-list button").forEach((b) => b.setAttribute("aria-pressed", "false"));
  button.setAttribute("aria-pressed", "true");
  current = v;
  video.pause();
  video.style.objectViewBox = "";
  if (v.has_local_video) video.src = `/media/${v.local_video}`;
  else if (v.video_url) video.src = v.video_url;
  else video.removeAttribute("src");
  // показуємо лише регіон, який озвучуємо (crop). object-view-box: Chrome/Edge; в інших браузерах — увесь кадр
  video.onloadedmetadata = () => {
    if (!v.crop || !video.videoWidth) return;
    const [x, y, w, h] = v.crop, W = video.videoWidth, H = video.videoHeight;
    const pct = (a, b) => `${((a / b) * 100).toFixed(2)}%`;
    video.style.objectViewBox = `inset(${pct(y, H)} ${pct(W - x - w, W)} ${pct(H - y - h, H)} ${pct(x, W)})`;
  };
  presetSel.value = v.preset;
  await loadScore();
}

async function init() {
  const [videos, presets] = await Promise.all([getJSON("/api/videos"), getJSON("/api/presets")]);
  presetSel.innerHTML = presets.map((p) => `<option value="${p}">${p}</option>`).join("");
  presetSel.onchange = () => current && loadScore();

  const list = $("video-list");
  for (const v of videos) {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-pressed", "false");
    b.innerHTML = `${v.title}<small>${v.has_features ? "дані готові" : "демо-дані"}${v.has_quiz ? " · є гра" : ""}</small>`;
    b.onclick = () => selectVideo(v, b);
    li.append(b);
    list.append(li);
  }

  $("play-btn").onclick = async () => {
    if (!player) return (statusEl.textContent = "Спершу оберіть візуалізацію");
    await Tone.start(); // браузер дозволяє звук лише після кліку
    clockStart = Tone.now();
    player.start();
    if (hasVideo()) video.play();
  };
  $("stop-btn").onclick = () => {
    player?.stop();
    video.pause();
  };
  // звук іде за відео: пауза/перемотка/кінець
  video.addEventListener("pause", () => player?.pause());
  video.addEventListener("play", () => player?.resume());
  video.addEventListener("ended", () => player?.stop());
}

init().catch((e) => (statusEl.textContent = "Помилка: " + e.message));
