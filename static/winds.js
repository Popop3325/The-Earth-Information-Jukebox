// Варіанти «повітря/хуртовини» (їх використовує player.js).
// Кожен варіант: build(out) → { start(), stop(), set(intensity 0..1), dispose() }.
// intensity — «сила снігу/вітру» (у проєкті: white_frac). Пориви — повільні (< 0.2 Гц), без модуляції 4 Гц.
// Обраний варіант потім підключається в player.js як synth-шар "air".

/** Пориви: два повільні LFO з неспівмірними частотами → «живі», нерегулярні хвилі вітру. */
function gusts(param, base, depth, f1 = 0.07, f2 = 0.17, keep) {
  const a = keep(new Tone.LFO({ frequency: f1, min: base - depth * 0.6, max: base + depth * 0.6 }).start());
  const b = keep(new Tone.LFO({ frequency: f2, min: -depth * 0.4, max: depth * 0.4, phase: 90 }).start());
  a.connect(param);
  b.connect(param);
  return {
    set(newBase, newDepth) {
      a.min = newBase - newDepth * 0.6; a.max = newBase + newDepth * 0.6;
      b.min = -newDepth * 0.4; b.max = newDepth * 0.4;
    },
  };
}

function kit() {
  const nodes = [];
  const keep = (n) => (nodes.push(n), n);
  return {
    keep,
    sources: [],
    src(n) { this.sources.push(keep(n)); return n; },
    start() { this.sources.forEach((s) => s.state !== "started" && s.start()); },
    stop() { this.sources.forEach((s) => s.stop()); },
    dispose() { nodes.forEach((n) => n.dispose()); },
  };
}

const lerp = (a, b, x) => a + (b - a) * x;

export const WIND_VARIANTS = {
  current: {
    label: "0. Поточний (зараз у проєкті)",
    desc: "Рожевий шум у середній смузі, «дихання» ±20% з періодом 13 с і тонкий свист. Для порівняння.",
    build(out) {
      const k = kit(), { keep } = k;
      const noise = k.src(new Tone.Noise({ type: "pink", volume: 0 }));
      const filter = keep(new Tone.Filter({ type: "bandpass", frequency: 1200, Q: 0.6 }));
      const g = keep(new Tone.Gain(1));
      noise.chain(filter, g, out);
      keep(new Tone.LFO({ frequency: 1 / 13.3, min: 0.8, max: 1.2 }).start()).connect(g.gain);
      const wn = k.src(new Tone.Noise({ type: "white", volume: -6 }));
      const wf = keep(new Tone.Filter({ type: "bandpass", frequency: 2200, Q: 30 }));
      const wg = keep(new Tone.Gain(0));
      wn.chain(wf, wg, out);
      keep(new Tone.LFO({ frequency: 1 / 9, min: 1800, max: 2600 }).start()).connect(wf.frequency);
      return { ...k, set(x) { filter.frequency.rampTo(lerp(800, 3000, x), 0.3); wg.gain.rampTo(x > 0.5 ? (x - 0.5) * 0.25 : 0, 0.3); } };
    },
  },

  classic: {
    label: "1. Класична хуртовина",
    desc: "Білий шум, смуга фільтра «гуляє» з поривами. Сильний, широкий, «відкритий» вітер.",
    build(out) {
      const k = kit(), { keep } = k;
      const noise = k.src(new Tone.Noise({ type: "white", volume: -5 }));
      const hp = keep(new Tone.Filter(250, "highpass"));
      const bp = keep(new Tone.Filter({ type: "bandpass", frequency: 1200, Q: 0.9 }));
      const g = keep(new Tone.Gain(0.7));
      noise.chain(hp, bp, g, out);
      const sweep = gusts(bp.frequency, 1200, 900, 0.06, 0.15, keep);
      const amp = gusts(g.gain, 0.7, 0.4, 0.08, 0.19, keep);
      return { ...k, set(x) { sweep.set(lerp(700, 1800, x), lerp(300, 1300, x)); amp.set(lerp(0.45, 0.85, x), lerp(0.15, 0.55, x)); } };
    },
  },

  howl: {
    label: "2. Свист у щілинах",
    desc: "Три вузькі резонанси, що повільно пливуть по висоті: «виє» між будинками й деревами. Найбільш «зимовий».",
    build(out) {
      const k = kit(), { keep } = k;
      const bedNoise = k.src(new Tone.Noise({ type: "pink", volume: -8 }));
      const bedF = keep(new Tone.Filter(1400, "lowpass"));
      const bedG = keep(new Tone.Gain(0.5));
      bedNoise.chain(bedF, bedG, out);
      gusts(bedG.gain, 0.5, 0.3, 0.05, 0.13, keep);
      const wNoise = k.src(new Tone.Noise({ type: "pink", volume: 12 }));
      const whistles = [[700, 0.05], [1150, 0.08], [1750, 0.11]].map(([f, rate], i) => {
        const bp = keep(new Tone.Filter({ type: "bandpass", frequency: f, Q: 28 }));
        const g = keep(new Tone.Gain(0.3));
        wNoise.connect(bp); bp.chain(g, out);
        keep(new Tone.LFO({ frequency: rate, min: f * 0.85, max: f * 1.15, phase: i * 100 }).start()).connect(bp.frequency);
        return gusts(g.gain, 0.3, 0.25, 0.04 + i * 0.03, 0.11 + i * 0.02, keep);
      });
      return { ...k, set(x) { bedG.gain.rampTo(lerp(0.3, 0.8, x), 0.3); whistles.forEach((w) => w.set(lerp(0.05, 0.55, x), lerp(0.05, 0.4, x))); } };
    },
  },

  storm: {
    label: "3. Глибокий шторм",
    desc: "Низький гул (коричневий шум) + середній шар з великими поривами. Важкий, темний, «могутній».",
    build(out) {
      const k = kit(), { keep } = k;
      const rumble = k.src(new Tone.Noise({ type: "brown", volume: -8 }));
      const lp = keep(new Tone.Filter(450, "lowpass"));
      const rg = keep(new Tone.Gain(0.6));
      rumble.chain(lp, rg, out);
      const r = gusts(rg.gain, 0.6, 0.35, 0.04, 0.09, keep);
      const mid = k.src(new Tone.Noise({ type: "pink", volume: -12 }));
      const bp = keep(new Tone.Filter({ type: "bandpass", frequency: 900, Q: 0.7 }));
      const mg = keep(new Tone.Gain(0.5));
      mid.chain(bp, mg, out);
      const m = gusts(mg.gain, 0.5, 0.45, 0.07, 0.16, keep);
      gusts(bp.frequency, 900, 400, 0.05, 0.12, keep);
      return { ...k, set(x) { r.set(lerp(0.35, 0.9, x), lerp(0.15, 0.5, x)); m.set(lerp(0.2, 0.8, x), lerp(0.15, 0.6, x)); } };
    },
  },

  driftsnow: {
    label: "4. Заметіль (сніговий шурхіт)",
    desc: "Високе «шипіння» снігу, що летить, на м'якій низькій подушці вітру. Тонше й тихіше, ніж шторм.",
    build(out) {
      const k = kit(), { keep } = k;
      const hiss = k.src(new Tone.Noise({ type: "white", volume: -10 }));
      const hp = keep(new Tone.Filter(3500, "highpass"));
      const hg = keep(new Tone.Gain(0.5));
      hiss.chain(hp, hg, out);
      const h = gusts(hg.gain, 0.5, 0.35, 0.09, 0.21, keep);
      const bed = k.src(new Tone.Noise({ type: "pink", volume: -4 }));
      const lp = keep(new Tone.Filter(700, "lowpass"));
      const bg = keep(new Tone.Gain(0.5));
      bed.chain(lp, bg, out);
      const b = gusts(bg.gain, 0.5, 0.25, 0.05, 0.12, keep);
      return { ...k, set(x) { h.set(lerp(0.15, 0.9, x), lerp(0.1, 0.5, x)); b.set(lerp(0.3, 0.7, x), lerp(0.1, 0.35, x)); hp.frequency.rampTo(lerp(4500, 2500, x), 0.3); } };
    },
  },

  moan: {
    label: "5. Завивання (стогін вітру)",
    desc: "Два резонанси повільно ковзають вгору-вниз і «гуляють» між вухами. Протяжне, моторошне завивання.",
    build(out) {
      const k = kit(), { keep } = k;
      const pan = keep(new Tone.AutoPanner({ frequency: 0.05, depth: 0.7 }).start().connect(out));
      const noise = k.src(new Tone.Noise({ type: "pink", volume: 18 }));
      const voices = [[400, 900, 0.09, 0], [600, 1300, 0.13, 120]].map(([lo, hi, rate, phase]) => {
        const bp = keep(new Tone.Filter({ type: "bandpass", frequency: lo, Q: 12 }));
        const g = keep(new Tone.Gain(0.4));
        noise.connect(bp); bp.chain(g, pan);
        const lfo = keep(new Tone.LFO({ frequency: rate, min: lo, max: hi, phase }).start());
        lfo.connect(bp.frequency);
        const amp = gusts(g.gain, 0.4, 0.3, rate * 0.7, rate * 1.6, keep);
        return { bp, lfo, amp, lo, hi };
      });
      const bed = k.src(new Tone.Noise({ type: "pink", volume: -6 }));
      const bedF = keep(new Tone.Filter(1000, "lowpass"));
      bed.chain(bedF, pan);
      return {
        ...k,
        set(x) {
          voices.forEach((v) => {
            v.bp.Q.rampTo(lerp(6, 18, x), 0.3);
            v.lfo.min = v.lo * lerp(0.8, 1.1, x); v.lfo.max = v.hi * lerp(0.8, 1.3, x);
            v.amp.set(lerp(0.2, 0.9, x), lerp(0.1, 0.5, x));
          });
        },
      };
    },
  },
};
