// Синтез звуку з фіч (Tone.js). Правила «фіча → параметр» лежать у shared/mapping.json.
//
// Ідея:
//  - неперервні параметри (гучність, фільтр, темп) лінійно інтерполюються між семплами;
//  - лад (мажор/мінор) і акорд змінюються лише на початку такту, з гістерезисом.

const lerp = (a, b, x) => a + (b - a) * x;

export class Jukebox {
  constructor(features, mapping, videoEl, onStatus = () => {}) {
    this.f = features;
    this.m = mapping;
    this.video = videoEl;
    this.onStatus = onStatus;
    this.mode = mapping.mode.below;
    this.pendingMode = null;
    this.pendingSince = 0;
    this.startedAt = 0;
    this.buildGraph();
  }

  // ---------- аудіограф ----------
  buildGraph() {
    this.reverb = new Tone.Reverb({ decay: 4, wet: 0.3 }).toDestination();
    this.filter = new Tone.Filter(2000, "lowpass").connect(this.reverb);
    this.panner = new Tone.Panner(0).connect(this.filter);
    this.master = new Tone.Volume(-12).connect(this.panner);

    this.pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "sine" },
      envelope: { attack: 1, release: 2 },
    }).connect(this.master);
    this.pad.volume.value = -10;

    this.lead = new Tone.Synth({ oscillator: { type: "triangle" }, envelope: { release: 0.4 } }).connect(this.master);
    this.perc = new Tone.MembraneSynth().connect(this.master);
    this.perc.volume.value = -8;

    this.barLoop = new Tone.Loop((time) => this.onBar(time), "1m"); // один такт
    this.noteLoop = new Tone.Loop((time) => this.onEighth(time), "8n");
  }

  // ---------- дані ----------
  /** Поточний час відео (або таймер, якщо відео немає) */
  now() {
    if (this.video?.getAttribute("src") && !Number.isNaN(this.video.duration)) return this.video.currentTime;
    return (Tone.now() - this.startedAt) % this.f.duration_s;
  }

  /** Фічі в момент t: лінійна інтерполяція між двома сусідніми семплами */
  featuresAt(t) {
    const fr = this.f.frames;
    const i = Math.min(Math.max(Math.floor(t * this.f.sample_fps), 0), fr.length - 1);
    const a = fr[i], b = fr[Math.min(i + 1, fr.length - 1)];
    const x = b.t > a.t ? Math.min(Math.max((t - a.t) / (b.t - a.t), 0), 1) : 0;
    const out = {};
    for (const k of this.f.features) out[k] = lerp(a[k], b[k], x);
    return out;
  }

  param(name, feats) {
    const p = this.m.params[name];
    return lerp(p.min, p.max, feats[p.feature] ?? 0);
  }

  scaleNote(degree) {
    const scale = this.m.scales[this.mode];
    const d = Math.round(degree);
    const semis = 12 * Math.floor(d / scale.length) + scale[((d % scale.length) + scale.length) % scale.length];
    return Tone.Frequency(this.m.root_note).transpose(semis + 12).toNote();
  }

  // ---------- музика ----------
  onBar(time) {
    const feats = this.featuresAt(this.now());
    const md = this.m.mode;
    const wanted = feats[md.feature] > md.threshold ? md.above : md.below;

    // Гістерезис: міняємо лад, лише якщо нове значення тримається ≥ hold_s
    if (wanted !== this.mode) {
      if (this.pendingMode !== wanted) { this.pendingMode = wanted; this.pendingSince = this.now(); }
      else if (this.now() - this.pendingSince >= md.hold_s) { this.mode = wanted; this.pendingMode = null; }
    } else this.pendingMode = null;

    const root = Tone.Frequency(this.m.root_note);
    const third = this.mode === "minor" ? 3 : 4;
    this.pad.triggerAttackRelease([root, root.transpose(third), root.transpose(7)].map((n) => n.toNote()), "1m", time);
  }

  onEighth(time) {
    const feats = this.featuresAt(this.now());

    // неперервні параметри: плавно
    this.master.volume.rampTo(this.param("volume_db", feats), 0.2);
    this.filter.frequency.rampTo(this.param("filter_hz", feats), 0.2);
    this.panner.pan.rampTo(this.param("pan", feats), 0.2);
    this.reverb.wet.rampTo(this.param("reverb_wet", feats), 0.5);
    Tone.Transport.bpm.rampTo(this.param("tempo_bpm", feats), 1);

    this.lead.triggerAttackRelease(this.scaleNote(this.param("melody_degree", feats)), "16n", time);
    if (Math.random() < this.param("percussion_prob", feats)) this.perc.triggerAttackRelease("C1", "16n", time);

    this.onStatus(
      `t=${this.now().toFixed(1)}s · ${this.mode} · ${Tone.Transport.bpm.value.toFixed(0)} BPM · ` +
      Object.entries(feats).map(([k, v]) => `${k}=${v.toFixed(2)}`).join(" ")
    );
  }

  start() {
    this.startedAt = Tone.now();
    this.barLoop.start(0);
    this.noteLoop.start(0);
    Tone.Transport.start();
  }

  stop() {
    Tone.Transport.stop();
    this.barLoop.stop();
    this.noteLoop.stop();
    this.pad.releaseAll();
  }
}
