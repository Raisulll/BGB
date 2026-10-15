// Audio devices for calls (spec #58 extension): which microphone sends and which output plays the
// other person. Browsers name devices only after the microphone is allowed, and only some let a
// page choose the output (setSinkId: Chrome/Edge/Firefox on computers, some phone browsers).
// Where the phone names its earpiece and loudspeaker, the call panel offers a one-tap switch.

export const canChooseOutput = () => typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

const EARPIECE = /earpiece|receiver|handset/i;
const SPEAKER = /speaker/i;

/** Named microphones and (where the browser allows choosing) outputs. */
export async function listDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return { inputs: [], outputs: [] };
  const all = await navigator.mediaDevices.enumerateDevices();
  const named = (d) => d.deviceId && d.label;
  return {
    inputs: all.filter((d) => d.kind === 'audioinput' && named(d)),
    outputs: canChooseOutput() ? all.filter((d) => d.kind === 'audiooutput' && named(d)) : [],
  };
}

/** The phone's earpiece and loudspeaker, when the device names both. */
export function phoneRoutes(outputs) {
  const earpiece = outputs.find((d) => EARPIECE.test(d.label));
  const speaker = outputs.find((d) => SPEAKER.test(d.label) && !EARPIECE.test(d.label));
  return earpiece && speaker ? { earpiece, speaker } : null;
}

// The devices last chosen, for the next call on this browser (a convenience: may be unavailable)
const KEY = 'birds.callDevices';
export function savedDevices() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}
export function saveDevice(kind, deviceId) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...savedDevices(), [kind]: deviceId }));
  } catch {}
}
