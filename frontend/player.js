// ScorePlayer: програє партитуру (score.json з /api/score/<id>) синхронно з часом відео.
// Спільний для джукбокса (app.js) і гри (game/). Власник: №4 (frontend).
//
// Використання:
//   const score = await (await fetch(`/api/score/${id}`)).json();
//   const player = new ScorePlayer(score, { getTime: () => video.currentTime, getRate: () => video.playbackRate });
//   await player.load();      // завантажити семпли
//   await Tone.start();       // лише після кліку користувача
//   player.start();           // далі звук сам іде за getTime()
//   player.pause(); player.resume(); player.stop();
//
// Формат партитури: shared/schema/score.schema.json

const SOUNDS = "/static/sounds/";

function gainAt(points, t) {
  if (!points.length) return 0;
  if (t <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [t1, g1] = points[i];
    if (t <= t1) {
      const [t0, g0] = points[i - 1];
      return g0 + (g1 - g0) * ((t - t0) / Math.max(t1 - t0, 1e-9));
    }
  }
  return points[points.length - 1][1];
}

function makeInstruments(out) {
  const bell = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 3, modulationIndex: 8,
    envelope: { attack: 0.005, decay: 1.2, sustain: 0, release: 1.2 },
  }).connect(out);
  bell.volume.value = -14;
  const pluck = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "triangle" }, envelope: { attack: 0.005, decay: 0.3, sustain: 0, release: 0.3 },
  }).connect(out);
  pluck.volume.value = -10;
  const pad = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "sine" }, envelope: { attack: 0.8, decay: 0.5, sustain: 0.7, release: 1.5 },
  }).connect(out);
  pad.volume.value = -16;
  const drum = new Tone.MembraneSynth().connect(out);
  drum.volume.value = -6;
  return { bell, pluck, pad, drum };
}

export class ScorePlayer {
  constructor(score, { getTime, getRate = () => 1 } = {}) {
    this.score = score;
    this.getTime = getTime;
    this.getRate = getRate;
    this.lastT = null;
    this.nextEvent = 0;
    this.timer = null;
    this.paused = false;
    this.onTick = null; // (t, player) => {} — для UI

    this.master = new Tone.Volume(-4);
    this.reverb = new Tone.Reverb({ decay: 3, wet: 0.25 });
    this.master.chain(this.reverb, Tone.getDestination());
    this.instruments = makeInstruments(this.master);
    // points — крива гучності з партитури, node — Tone.Gain, player — Tone.Player
    this.layers = score.layers.map((l) => {
      const node = new Tone.Gain(0).connect(this.master);
      const player = new Tone.Player({ url: SOUNDS + l.sample, loop: l.loop !== false }).connect(node);
      return { id: l.id, points: l.gain, node, player };
    });
  }

  load() {
    return Tone.loaded();
  }

  /** Поточна гучність шару в момент t (0..1) — для візуалізації */
  layerGain(id, t = this.getTime()) {
    const l = this.layers.find((x) => x.id === id);
    return l ? gainAt(l.points, t) : 0;
  }

  start() {
    this.layers.forEach((l) => l.player.state !== "started" && l.player.start());
    this.paused = false;
    this.lastT = null;
    clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), 40);
  }

  pause() {
    this.paused = true;
    this.layers.forEach((l) => l.node.gain.rampTo(0, 0.2));
    Object.values(this.instruments).forEach((i) => i.releaseAll?.());
  }

  resume() {
    if (!this.timer) return this.start();
    this.paused = false;
    this.lastT = null;
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.pause();
    setTimeout(() => this.layers.forEach((l) => l.player.stop()), 300);
  }

  dispose() {
    this.stop();
    setTimeout(() => {
      this.layers.forEach((l) => { l.player.dispose(); l.node.dispose(); });
      Object.values(this.instruments).forEach((i) => i.dispose());
      this.reverb.dispose(); this.master.dispose();
    }, 400);
  }

  tick() {
    if (this.paused) return;
    const t = this.getTime();
    for (const l of this.layers) l.node.gain.rampTo(gainAt(l.points, t), 0.1);

    const events = this.score.events;
    // перемотка назад або великий стрибок: шукаємо наступну подію заново
    if (this.lastT === null || t < this.lastT || t - this.lastT > 1) {
      this.nextEvent = events.findIndex((e) => e.t >= t);
      if (this.nextEvent < 0) this.nextEvent = events.length;
    }
    const rate = Math.max(this.getRate() || 1, 0.05);
    while (this.nextEvent < events.length && events[this.nextEvent].t <= t) {
      const e = events[this.nextEvent++];
      const inst = this.instruments[e.instrument] || this.instruments.bell;
      const dur = e.dur / rate; // тривалість у секундах відео → реальні секунди
      if (e.instrument === "drum") inst.triggerAttackRelease(e.notes[0], dur, undefined, e.vel);
      else inst.triggerAttackRelease(e.notes, dur, undefined, e.vel);
    }
    this.lastT = t;
    this.onTick?.(t, this);
  }
}
