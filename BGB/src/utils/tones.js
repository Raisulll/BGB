// Call tones generated with Web Audio (no audio files to ship or fetch).
// 'ring': incoming call; 'ringback': the caller hears it while the other side rings.
const PATTERNS = {
  ring: { freqs: [440, 480], on: 1.2, period: 3 },
  ringback: { freqs: [425], on: 1, period: 4 },
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
  const { freqs, on, period } = PATTERNS[kind] || PATTERNS.ring;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(ctx.destination);
  const oscillators = freqs.map((f) => {
    const o = ctx.createOscillator();
    o.frequency.value = f;
    o.connect(gain);
    o.start();
    return o;
  });
  const beep = () => {
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.setValueAtTime(0, t + on);
  };
  ctx.resume?.().catch(() => {});
  beep();
  const timer = setInterval(beep, period * 1000);
  return () => {
    clearInterval(timer);
    oscillators.forEach((o) => {
      try {
        o.stop();
      } catch {}
    });
    ctx.close?.().catch(() => {});
  };
}
