// Specs #10, #11, #22 — print previews of evidence for the report's incident annex. Images are
// reduced to print size (keeps memory low when a report holds many photos); a video gets a still
// frame plus its duration and resolution. Everything happens in the browser from the decrypted
// file the server sends; nothing is stored.
const MAX_PX = 1600;

export const isPreviewable = (mime) => /^image\/(jpeg|png|gif)$/.test(mime || '') || /^video\/(mp4|quicktime)$/.test(mime || '');

const toBlob = (canvas) => new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', 0.85));

function scaled(width, height) {
  const k = Math.min(1, MAX_PX / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * k));
  canvas.height = Math.max(1, Math.round(height * k));
  return canvas;
}

async function imagePreview(blob) {
  const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const canvas = scaled(bmp.width, bmp.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // transparent PNG/GIF areas print white
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const out = { width: bmp.width, height: bmp.height };
  bmp.close();
  return { ...out, url: URL.createObjectURL(await toBlob(canvas)) };
}

// A frame that is almost one flat colour (fade-in, black leader) tells the reader nothing
function isBlank(canvas) {
  const w = 32, h = 18;
  const probe = document.createElement('canvas');
  probe.width = w;
  probe.height = h;
  const ctx = probe.getContext('2d');
  ctx.drawImage(canvas, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  let sum = 0, sq = 0;
  for (let i = 0; i < px.length; i += 4) {
    const y = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    sum += y;
    sq += y * y;
  }
  const n = px.length / 4;
  return Math.sqrt(sq / n - (sum / n) ** 2) < 6; // luminance standard deviation
}

/** A representative still frame (skipping blank ones) + duration and resolution. */
function videoPreview(blob) {
  return new Promise((resolve, reject) => {
    const src = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    let times = [];
    let fallback = null; // last frame tried, used if every candidate is blank
    const finish = (fn) => {
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(src);
      fn();
    };
    // The browser can't decode every codec (e.g. HEVC .mov); report that instead of waiting forever
    const unsupported = () => finish(() => reject(Object.assign(new Error('Video frame not available'), { code: 'NO_FRAME' })));
    const timer = setTimeout(unsupported, 20000);
    const done = async (canvas, at) => {
      const info = { width: video.videoWidth, height: video.videoHeight, duration: Number.isFinite(video.duration) ? video.duration : null, frameAt: at };
      try {
        const frame = await toBlob(canvas);
        finish(() => resolve({ ...info, url: URL.createObjectURL(frame) }));
      } catch {
        unsupported();
      }
    };
    video.onerror = unsupported;
    video.onloadedmetadata = () => {
      const d = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      times = d ? [Math.min(1, d / 4), d * 0.25, d * 0.5, d * 0.75].filter((t, i, a) => i === 0 || t > a[i - 1] + 0.05) : [0.01];
      video.currentTime = times.shift();
    };
    video.onseeked = () => {
      if (!video.videoWidth) return unsupported();
      const canvas = scaled(video.videoWidth, video.videoHeight);
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      fallback = { canvas, at: video.currentTime };
      if (!isBlank(canvas) || !times.length) return done(fallback.canvas, fallback.at);
      video.currentTime = times.shift();
    };
    video.src = src;
  });
}

/** { url, width, height, duration?, frameAt? } — the caller revokes url. */
export function makePreview(blob, mimeType) {
  return mimeType.startsWith('video/') ? videoPreview(blob) : imagePreview(blob);
}

/** 42 → "0:42", 3725 → "1:02:05" */
export function formatDuration(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return '';
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
