// UI: список відео, плеєр, кнопки. Звук: див. audio.js
import { Jukebox } from "./audio.js";

const $ = (id) => document.getElementById(id);
const video = $("video");
const statusEl = $("status");
let jukebox = null;

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

async function selectVideo(v, button) {
  document.querySelectorAll(".video-list button").forEach((b) => b.setAttribute("aria-pressed", "false"));
  button.setAttribute("aria-pressed", "true");
  jukebox?.stop();

  const [features, mapping] = await Promise.all([getJSON(`/api/features/${v.id}`), getJSON("/api/mapping")]);
  jukebox = new Jukebox(features, mapping, video, (s) => (statusEl.textContent = s));

  if (v.has_local_video) video.src = `/media/${v.id}.mp4`;
  else if (v.video_url) video.src = v.video_url;
  else video.removeAttribute("src");

  $("video-note").textContent =
    (features.is_sample ? "⚠ Фічі ще не пораховано, звучать демо-дані. " : "") +
    (video.getAttribute("src") ? "" : "Відео не знайдено: звук іде за таймером. ");
}

async function init() {
  const videos = await getJSON("/api/videos");
  const list = $("video-list");
  for (const v of videos) {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-pressed", "false");
    b.innerHTML = `${v.title}<small>${v.has_features ? "фічі готові" : "демо-фічі"}</small>`;
    b.onclick = () => selectVideo(v, b);
    li.append(b);
    list.append(li);
  }

  $("play-btn").onclick = async () => {
    if (!jukebox) return (statusEl.textContent = "Спершу оберіть візуалізацію");
    await Tone.start(); // браузер дозволяє звук лише після кліку
    jukebox.start();
    if (video.getAttribute("src")) video.play();
  };
  $("stop-btn").onclick = () => {
    jukebox?.stop();
    video.pause();
  };
}

init().catch((e) => (statusEl.textContent = "Помилка: " + e.message));
