import { useEffect, useState } from 'react';
import * as incidentsApi from '../../api/incidents';
import { errorMessage } from '../../api/client';
import Modal from '../ui/Modal';
import { useI18n } from '../../i18n/I18nContext';

// Spec #10 — image and video evidence shown in place. The types match what the server sends inline
// (INLINE_TYPES in evidence.service.ts); other files are downloaded. Files are fetched with the access
// token (no plain URLs: evidence never sits in the browser cache) and the server audits the first view.
export const PREVIEW_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'video/mp4']);

// One evidence file at a time: a video can be ~50 MB and the server decrypts it in memory
let queue = Promise.resolve();
function enqueue(task) {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

/** Object URL for a stored evidence file, or the load error. Revoked on unmount. */
function useEvidenceUrl(incidentId, ev) {
  const [state, setState] = useState({ url: null, error: null });
  useEffect(() => {
    let cancelled = false;
    let url = null;
    setState({ url: null, error: null });
    enqueue(async () => {
      if (cancelled) return; // left the page before its turn: don't fetch
      try {
        const { blob } = await incidentsApi.evidenceBlob(incidentId, ev.id);
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setState({ url, error: null });
      } catch (err) {
        if (!cancelled) setState({ url: null, error: errorMessage(err) });
      }
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [incidentId, ev.id]);
  return state;
}

/** Object URL for a file picked in the browser (not uploaded yet). */
function useLocalUrl(file) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url;
}

const SIZES = {
  large: { box: 'h-56 sm:h-72', media: 'max-h-56 sm:max-h-72' },
  small: { box: 'h-28', media: 'max-h-28' },
};

function Media({ url, error, name, mimeType, size }) {
  const { t } = useI18n();
  const [enlarged, setEnlarged] = useState(false);
  const s = SIZES[size];
  const isVideo = mimeType?.startsWith('video/');

  if (error) {
    return (
      <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
        <i className="fas fa-exclamation-triangle mr-1" />
        {error}
      </p>
    );
  }
  if (!url) {
    return (
      <div className={`mt-2 flex ${s.box} w-full items-center justify-center rounded-lg bg-slate-100`} role="status" aria-label={t('common.loading')}>
        <i className={`fas ${isVideo ? 'fa-film' : 'fa-image'} text-2xl text-slate-300`} />
      </div>
    );
  }
  if (isVideo) {
    return <video src={url} controls preload="metadata" className={`mt-2 ${s.media} w-full rounded-lg bg-slate-950`} aria-label={name} />;
  }
  return (
    <>
      <button type="button" onClick={() => setEnlarged(true)} className="mt-2 block w-full rounded-lg bg-slate-100" title={t('detail.enlarge')} aria-label={t('detail.enlargeAria', { name })}>
        <img src={url} alt={name} className={`mx-auto ${s.media} w-auto max-w-full rounded-lg object-contain`} />
      </button>
      {enlarged && (
        <Modal open title={name} icon="fa-image" onClose={() => setEnlarged(false)} maxWidth="max-w-5xl">
          <div className="flex items-center justify-center rounded-md bg-slate-950/90">
            <img src={url} alt={name} className="max-h-[75vh] w-auto max-w-full rounded-md object-contain" />
          </div>
        </Modal>
      )}
    </>
  );
}

/** A stored evidence file, loaded and shown in place. */
export default function EvidenceMedia({ incidentId, evidence, size = 'large' }) {
  const { url, error } = useEvidenceUrl(incidentId, evidence);
  return <Media url={url} error={error} name={evidence.name} mimeType={evidence.mimeType} size={size} />;
}

/** A file chosen for upload, shown from the browser's copy. */
export function LocalMedia({ file, size = 'small' }) {
  const url = useLocalUrl(file);
  return <Media url={url} error={null} name={file.name} mimeType={file.type} size={size} />;
}
