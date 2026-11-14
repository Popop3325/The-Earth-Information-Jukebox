// Джукбокс: список відео → відео + звук з партитури. Звук: player.js
import { ScorePlayer } from "./player.js";
import { setupExplain } from "./explain.js";

const $ = (id) => document.getElementById(id);
const video = $("video");
const statusEl = $("status");
const presetSel = $("preset");
let current = null; // { video meta }
let player = null;
let clockStart = 0; // якщо відео немає — звук іде за власним таймером
const mutedGroups = new Set(); // вимкнені користувачем шари (зберігаються при зміні пресету)

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

const hasVideo = () => !!video.getAttribute("src");
const nowT = (score) => (hasVideo() ? video.currentTime : (Tone.now() - clockStart) % score.duration_s);

// ---------- Відео на canvas: показуємо лише регіон (crop) у будь-якому браузері ----------
const view = $("view");
const ctx2d = view.getContext("2d");
const seek = $("seek");
let currentCrop = null; // [x, y, w, h] у пікселях оригіналу або null (увесь кадр)

function srcRect() {
  const W = video.videoWidth, H = video.videoHeight;
  return currentCrop ? currentCrop : [0, 0, W, H];
}
function sizeCanvas() {
  if (!video.videoWidth) return;
  const [, , w, h] = srcRect();
  const cssW = view.clientWidth || 960;
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  view.width = Math.round(cssW * scale);
  view.height = Math.round((cssW * h / w) * scale);
}
function drawFrame() {
  if (video.readyState < 2) return;
  const [x, y, w, h] = srcRect();
  ctx2d.drawImage(video, x, y, w, h, 0, 0, view.width, view.height);
}
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
function updateSeek() {
  const d = video.duration || 0;
  if (!seek.matches(":active")) seek.value = d ? Math.round((video.currentTime / d) * 1000) : 0;
  // реальний час з урахуванням швидкості (напр. 0.25× → 30 с відео = 2 хв)
  const r = video.playbackRate || 1;
  $("time").textContent = `${fmt(video.currentTime / r)} / ${fmt(d / r)}`;
}
(function loop() {
  if (!video.paused && !video.ended) drawFrame();
  updateSeek();
  requestAnimationFrame(loop);
})();
video.addEventListener("seeked", drawFrame);
window.addEventListener("resize", () => { sizeCanvas(); drawFrame(); });
seek.addEventListener("input", () => {
  if (video.duration) video.currentTime = (seek.value / 1000) * video.duration;
});
$("toggle-btn").onclick = async () => {
  if (video.paused) { await Tone.start(); if (player && !player.timer) player.start(); video.play(); } else video.pause();
};

let loadToken = 0;

async function loadScore() {
  const token = ++loadToken;
  const wasPlaying = player?.playing;
  player?.dispose();
  player = null; // поки новий не завантажився, кнопки нічого не запускають
  const preset = presetSel.value ? `?preset=${presetSel.value}` : "";
  const [score, features] = await Promise.all([
    getJSON(`/api/score/${current.id}${preset}`),
    getJSON(`/api/features/${current.id}`),
  ]);
  const p = new ScorePlayer(score, { getTime: () => nowT(score), getRate: () => (hasVideo() ? video.playbackRate : 1) });
  const tl = score.timeline;
  const dateAt = (t) => {
    if (!tl) return "";
    const d = new Date(tl.start);
    d.setDate(d.getDate() + Math.round(t * tl.days_per_second));
    return d.toISOString().slice(0, 10) + " · ";
  };
  const explain = setupExplain(score, features, mutedGroups, (ids, m) => p.setMuted(ids, m));
  p.onTick = (t) => {
    explain?.(t);
    const layers = p.layers.map((l) => `${l.id} ${(p.layerGain(l.id, t) * 100).toFixed(0)}%`).join(" · ");
    statusEl.textContent = `${dateAt(t)}t=${t.toFixed(1)}s · ${score.preset}${layers ? " · " + layers : ""}`;
  };
  await p.load();
  if (token !== loadToken) return p.dispose(); // за цей час користувач обрав інше
  player = p;
  // Пресет може задати швидкість відео (напр. 0.25×), щоб у сітці 72 BPM вистачило тактів
  video.defaultPlaybackRate = video.playbackRate = score.playback_rate || 1;
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
  currentCrop = v.crop || null;
  if (v.has_local_video) video.src = `/media/${v.local_video}`;
  else if (v.video_url) video.src = v.video_url;
  else video.removeAttribute("src");
  video.onloadedmetadata = () => { sizeCanvas(); drawFrame(); };
  video.onloadeddata = drawFrame;
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
