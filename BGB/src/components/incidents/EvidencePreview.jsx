import { useEffect, useState } from 'react';
import * as incidentsApi from '../../api/incidents';
import { errorMessage } from '../../api/client';
import Modal from '../ui/Modal';
import Spinner from '../ui/Spinner';
import { useI18n } from '../../i18n/I18nContext';

// Spec #10 — in-browser view of image and video evidence. Matches the types the server will
// send inline (INLINE_TYPES in evidence.service.ts); everything else is downloaded instead.
// Opened on request only: each view is fetched with the access token and audited (VIEW_EVIDENCE).
export const PREVIEW_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'video/mp4']);

export default function EvidencePreview({ incidentId, evidence, onClose }) {
  const { t } = useI18n();
  const [state, setState] = useState({ url: null, error: null });

  useEffect(() => {
    if (!evidence) return undefined;
    let cancelled = false;
    let url = null;
    setState({ url: null, error: null });
    incidentsApi
      .evidenceBlob(incidentId, evidence.id)
      .then(({ blob }) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setState({ url, error: null });
      })
      .catch((err) => !cancelled && setState({ url: null, error: errorMessage(err) }));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [incidentId, evidence]);

  if (!evidence) return null;
  const isVideo = evidence.mimeType?.startsWith('video/');
  return (
    <Modal open title={evidence.name} icon={isVideo ? 'fa-film' : 'fa-image'} onClose={onClose} maxWidth="max-w-4xl">
      <div className="flex min-h-[12rem] items-center justify-center rounded-xl bg-slate-950/90">
        {state.error ? (
          <p className="p-6 text-sm text-red-300">
            <i className="fas fa-exclamation-triangle mr-2" />
            {state.error}
          </p>
        ) : !state.url ? (
          <Spinner />
        ) : isVideo ? (
          <video src={state.url} controls autoPlay className="max-h-[70vh] w-full rounded-xl" />
        ) : (
          <img src={state.url} alt={evidence.name} className="max-h-[70vh] w-auto max-w-full rounded-xl object-contain" />
        )}
      </div>
      <p className="mt-3 text-[11px] text-gray-400">
        <i className="fas fa-shield-alt mr-1" />
        {t('detail.previewNote')}
      </p>
    </Modal>
  );
}
