// Call tones generated with Web Audio (no audio files to ship or fetch).
// 'ring': incoming call, a loud trilling double ring that is hard to miss.
// 'ringback': what the caller hears while the other side rings (a steady, moderate tone).
// 'alarm': a Flash Alert waiting to be acknowledged.
//
// Each pattern is a list of bursts per cycle: [start s, length s, frequencies Hz, trill Hz].
// A trill alternates the frequencies (like a desk phone's bell); without one they sound together.
const PATTERNS = {
  ring: { period: 2.6, level: 0.9, wave: 'square', bursts: [[0, 0.45, [1046, 1318], 16], [0.6, 0.45, [1046, 1318], 16]] },
  ringback: { period: 4, level: 0.12, wave: 'sine', bursts: [[0, 1, [425], 0]] },
  // Flash Alert: a two-tone siren, distinct from the call ring, until the alert is acknowledged
  alarm: { period: 1.6, level: 0.9, wave: 'sawtooth', bursts: [[0, 0.7, [880], 0], [0.8, 0.7, [660], 0]] },
};

/** Starts a repeating tone; returns a function that stops it. Never throws. */
export function startTone(kind) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return () => {};
  let ctx;
  try {
    ctx = new Ctx();
  } catch {
    return () => {};
  }
  const { period, level, wave, bursts } = PATTERNS[kind] || PATTERNS.ring;

  // Master level through a compressor: loud without clipping
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 6;
  compressor.ratio.value = 8;
  const master = ctx.createGain();
  master.gain.value = level;
  const makeup = ctx.createGain(); // back up to near full scale after compression
  makeup.gain.value = 1.6;
  master.connect(compressor);
  compressor.connect(makeup);
  makeup.connect(ctx.destination);

  const burst = (at, length, freqs, trill) => {
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(1, at + 0.01);
    env.gain.setValueAtTime(1, at + length - 0.02);
    env.gain.linearRampToValueAtTime(0, at + length);
    env.connect(master);
    if (trill) {
      // One oscillator stepping between the frequencies
      const o = ctx.createOscillator();
      o.type = wave;
      const step = 1 / trill / freqs.length;
      for (let t = 0, i = 0; t < length; t += step, i++) o.frequency.setValueAtTime(freqs[i % freqs.length], at + t);
      o.connect(env);
      o.start(at);
      o.stop(at + length);
    } else {
      for (const f of freqs) {
        const o = ctx.createOscillator();
        o.type = wave;
        o.frequency.value = f;
        o.connect(env);
        o.start(at);
        o.stop(at + length);
      }
    }
  };

  const cycle = () => {
    const t0 = ctx.currentTime + 0.05;
    for (const [start, length, freqs, trill] of bursts) burst(t0 + start, length, freqs, trill);
  };
  ctx.resume?.().catch(() => {});
  cycle();
  const timer = setInterval(cycle, period * 1000);
  return () => {
    clearInterval(timer);
    ctx.close?.().catch(() => {});
  };
}
