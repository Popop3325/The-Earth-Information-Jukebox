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
//   layers: { sample } — зациклений семпл, або { synth: {type: "air" | "drone"} } — синтезований шар;
//           gain: [[t, 0..1]], params: { filter_hz, gust, whistle: [[t, v]] } — автоматизація ручок шару.
//   events: інструменти bell, pluck, pad, drum, tuned_bell, wind_voice, ice, wood.

const SOUNDS = "/static/sounds/";

function curveAt(points, t) {
  if (!points || !points.length) return 0;
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

const lerp = (a, b, x) => a + (b - a) * x;
const FLUTE = [1, 0.25, 0.08, 0.03, 0, 0, 0];          // бас-флейта: майже чистий тон
const CLARINET = [1, 0.04, 0.5, 0.03, 0.28, 0.02, 0.14]; // кларнет: непарні гармоніки

function makeInstruments(out, track) {
  const keep = (n) => (track.push(n), n);
  const bell = keep(new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 3, modulationIndex: 8,
    envelope: { attack: 0.005, decay: 1.2, sustain: 0, release: 1.2 },
  }).connect(out));
  bell.volume.value = -14;
  const pluck = keep(new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "triangle" }, envelope: { attack: 0.005, decay: 0.3, sustain: 0, release: 0.3 },
  }).connect(out));
  pluck.volume.value = -10;
  const pad = keep(new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "sine" }, envelope: { attack: 0.8, decay: 0.5, sustain: 0.7, release: 1.5 },
  }).connect(out));
  pad.volume.value = -12;
  const drum = keep(new Tone.MembraneSynth().connect(out));
  drum.volume.value = -6;

  // Духовий голос: один, монофонічний; тембр флейта ↔ кларнет, ковзання висоти
  const windFilter = keep(new Tone.Filter(2600, "lowpass").connect(out));
  const wind_voice = keep(new Tone.Synth({
    oscillator: { type: "custom", partials: FLUTE },
    envelope: { attack: 0.18, decay: 0.2, sustain: 0.75, release: 0.6 },
  }).connect(windFilter));
  wind_voice.volume.value = -9;

  // Лід: короткий імпульс білого шуму на високих частотах (хрускіт насту)
  const iceFilter = keep(new Tone.Filter(6500, "highpass").connect(out));
  const ice = keep(new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.02, sustain: 0 } }).connect(iceFilter));
  ice.volume.value = -16;

  // Сухе дерево: глухий клацання (смуговий рожевий шум)
  const woodFilter = keep(new Tone.Filter({ type: "bandpass", frequency: 800, Q: 4 }).connect(out));
  const wood = keep(new Tone.NoiseSynth({ noise: { type: "pink" }, envelope: { attack: 0.001, decay: 0.05, sustain: 0 } }).connect(woodFilter));
  wood.volume.value = -8;

  return { bell, pluck, pad, drum, wind_voice, ice, wood };
}

/** Синтезований шар. Повертає {start, stop, setParams(t)} */
function makeSynthLayer(spec, node, master, track, beatSec) {
  const keep = (n) => (track.push(n), n);
  if (spec.type === "air") {
    // Повітря: один шумовий шар. «Дихання» ±20% з періодом 4 такти + пориви (глибина ← сніг) + тонкий свист
    const period = (spec.breath_period_beats || 16) * beatSec;
    const noise = keep(new Tone.Noise({ type: "pink", volume: -10 }));
    const filter = keep(new Tone.Filter({ type: "bandpass", frequency: 1200, Q: 0.6 }));
    const breath = keep(new Tone.Gain(1));
    const gust = keep(new Tone.Gain(1));
    noise.chain(filter, breath, gust, node);
    const depth = spec.breath_depth ?? 0.2;
    const breathLfo = keep(new Tone.LFO({ frequency: 1 / period, min: 1 - depth, max: 1 + depth }).connect(breath.gain));
    const gustLfo = keep(new Tone.LFO({ frequency: 2 / period, min: 0.5, max: 1.5, amplitude: 0 }).connect(gust.gain));
    // Свист: дуже вузька смуга білого шуму, що повільно «пливе» по висоті
    const wNoise = keep(new Tone.Noise({ type: "white", volume: -6 }));
    const wFilter = keep(new Tone.Filter({ type: "bandpass", frequency: 2200, Q: 30 }));
    const wGain = keep(new Tone.Gain(0));
    wNoise.chain(wFilter, wGain, master);
    const wLfo = keep(new Tone.LFO({ frequency: 1 / 9, min: 1800, max: 2600 }).connect(wFilter.frequency));
    return {
      start() { [noise, wNoise].forEach((n) => n.state !== "started" && n.start()); [breathLfo, gustLfo, wLfo].forEach((l) => l.state !== "started" && l.start()); },
      stop() { [noise, wNoise].forEach((n) => n.stop()); },
      mute() { wGain.gain.rampTo(0, 0.2); },
      setParams(p, t) {
        if (p.filter_hz) filter.frequency.rampTo(curveAt(p.filter_hz, t), 0.2);
        if (p.gust) gustLfo.amplitude.rampTo(curveAt(p.gust, t), 0.5);
        if (p.whistle) wGain.gain.rampTo(curveAt(p.whistle, t), 0.3);
      },
    };
  }
  if (spec.type === "drone") {
    // Тиха підкладка на тоніці з чутними обертонами (віртуальна висота на телефонах)
    const synth = keep(new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "custom", partials: [1, 0.6, 0.4, 0.25, 0.15] },
      envelope: { attack: 3, decay: 0.5, sustain: 1, release: 4 },
    }).connect(node));
    synth.volume.value = -10;
    let on = false;
    return {
      start() { if (!on) { synth.triggerAttack(spec.notes); on = true; } },
      stop() { synth.releaseAll(); on = false; },
      mute() {},
      setParams() {},
    };
  }
  console.warn("Невідомий synth-шар", spec);
  return { start() {}, stop() {}, mute() {}, setParams() {} };
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
    this.nodes = [];    // усе, що треба dispose()

    this.master = new Tone.Volume(-4);
    this.reverb = new Tone.Reverb({ decay: 3, wet: 0.25 });
    this.master.chain(this.reverb, Tone.getDestination());
    this.bellBus = new Tone.Gain(1).connect(this.master);
    this.instruments = makeInstruments(this.master, this.nodes);

    const beatSec = 60 / (score.tempo_bpm || 72); // реальні секунди на долю
    // points — крива гучності, node — Tone.Gain, src — семпл (Tone.Player) або синтезований шар
    this.layers = score.layers.map((l) => {
      const node = new Tone.Gain(0).connect(this.master);
      let src, synth = null;
      if (l.synth) synth = makeSynthLayer(l.synth, node, this.master, this.nodes, beatSec);
      else src = new Tone.Player({ url: SOUNDS + l.sample, loop: l.loop !== false }).connect(node);
      return { id: l.id, points: l.gain, params: l.params || {}, node, src, synth };
    });
  }

  load() {
    return Tone.loaded();
  }

  /** Поточна гучність шару в момент t (0..1) — для візуалізації */
  layerGain(id, t = this.getTime()) {
    const l = this.layers.find((x) => x.id === id);
    return l ? curveAt(l.points, t) : 0;
  }

  /** true, якщо звук зараз іде (для UI: чи перезапускати після зміни пресету) */
  get playing() {
    return !!this.timer && !this.paused && !this.disposed;
  }

  start() {
    if (this.disposed) return; // знищений плеєр не можна запустити знову
    clearTimeout(this.stopTimer);
    for (const l of this.layers) {
      if (l.src && l.src.state !== "started") l.src.start();
      l.synth?.start();
    }
    this.paused = false;
    this.lastT = null;
    clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), 40);
  }

  pause() {
    if (this.disposed) return;
    this.paused = true;
    this.layers.forEach((l) => { l.node.gain.rampTo(0, 0.2); l.synth?.mute(); });
    Object.values(this.instruments).forEach((i) => i.releaseAll?.());
    this.instruments.wind_voice.triggerRelease();
  }

  resume() {
    if (this.disposed) return;
    if (!this.timer) return this.start();
    this.paused = false;
    this.lastT = null;
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.pause();
    this.stopTimer = setTimeout(() => this.layers.forEach((l) => { l.src?.stop(); l.synth?.stop(); }), 300);
  }

  dispose() {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
    setTimeout(() => {
      this.layers.forEach((l) => { l.src?.dispose(); l.node.dispose(); });
      this.nodes.forEach((n) => n.dispose());
      this.bellBus.dispose(); this.reverb.dispose(); this.master.dispose();
    }, 5000); // даємо дозвучати дронам і дзвонам
  }

  /** Дзвін з нерівногармонічним спектром: хам 0.5, прайм 1, тирс (1.2 зима … 1.25 літо), квінта 1.5, номінал 2.
   *  glass (0..1) додає «скляні» високі частки і вкорочує звон; ring — довжина звону в секундах. */
  tunedBell(e) {
    const ctx = Tone.getContext().rawContext;
    const t0 = ctx.currentTime + 0.01;
    const f0 = Tone.Frequency(e.notes[0]).toFrequency();
    const glass = e.glass || 0;
    const ring = (e.ring || 1.5) * (1 - 0.4 * glass);
    const tierce = e.tierce || 1.2;
    const partials = [
      [0.5, 0.35 * (1 - 0.6 * glass), 1.0],
      [1, 0.6, 0.8],
      [tierce, 0.4, 0.7],
      [1.5, 0.2, 0.5],
      [2, 0.3, 0.6],
      [2.92, 0.3 * glass, 0.25],
      [4.16, 0.22 * glass, 0.15],
      [5.43, 0.15 * glass, 0.1],
    ];
    const peak = (e.vel ?? 0.5) * 0.16;
    for (const [ratio, amp, decay] of partials) {
      if (amp <= 0.001) continue;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.value = f0 * ratio;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(peak * amp, t0 + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05 + ring * decay);
      osc.connect(g);
      Tone.connect(g, this.bellBus);
      osc.start(t0);
      osc.stop(t0 + ring + 0.2);
    }
  }

  windVoice(e, dur) {
    const s = this.instruments.wind_voice;
    const x = e.timbre ?? 0;
    s.oscillator.partials = FLUTE.map((v, i) => lerp(v, CLARINET[i], x));
    const now = Tone.now();
    const target = Tone.Frequency(e.notes[0]).toFrequency();
    if (e.glide_from) {
      s.triggerAttack(e.glide_from, now, e.vel);
      s.frequency.exponentialRampToValueAtTime(target, now + 0.3); // ковзання до ноти
    } else {
      s.triggerAttack(e.notes[0], now, e.vel);
    }
    s.triggerRelease(now + dur);
  }

  tick() {
    if (this.paused || this.disposed) return;
    const t = this.getTime();
    for (const l of this.layers) {
      l.node.gain.rampTo(curveAt(l.points, t), 0.1);
      l.synth?.setParams(l.params, t);
    }

    const events = this.score.events;
    // перемотка назад або великий стрибок: шукаємо наступну подію заново
    if (this.lastT === null || t < this.lastT || t - this.lastT > 1) {
      this.nextEvent = events.findIndex((e) => e.t >= t);
      if (this.nextEvent < 0) this.nextEvent = events.length;
    }
    const rate = Math.max(this.getRate() || 1, 0.05);
    while (this.nextEvent < events.length && events[this.nextEvent].t <= t) {
      const e = events[this.nextEvent++];
      const dur = e.dur / rate; // тривалість у секундах відео → реальні секунди
      switch (e.instrument) {
        case "tuned_bell": this.tunedBell(e); break;        // ring — уже в реальних секундах
        case "wind_voice": this.windVoice(e, dur); break;
        case "ice": case "wood": this.instruments[e.instrument].triggerAttackRelease(e.dur, undefined, e.vel); break;
        case "drum": this.instruments.drum.triggerAttackRelease(e.notes[0], dur, undefined, e.vel); break;
        default: (this.instruments[e.instrument] || this.instruments.bell).triggerAttackRelease(e.notes, dur, undefined, e.vel);
      }
    }
    this.lastT = t;
    this.onTick?.(t, this);
  }
}
