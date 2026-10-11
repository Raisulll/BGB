import { useEffect, useState } from 'react';
import * as incidentsApi from '../api/incidents';
import { errorMessage } from '../api/client';
import { isPreviewable, makePreview } from '../utils/evidencePreview';

/**
 * Specs #10, #22 — print previews for every image/video in the report's incident annex, keyed by
 * evidence id: { status: 'loading' | 'ready' | 'error', url?, width?, height?, duration?, frameAt?,
 * code?, message? }. Files are fetched one at a time (the server decrypts each in memory; a video
 * can be ~50 MB) with the access token, and the server audits each view (VIEW_EVIDENCE).
 */
export default function useEvidencePreviews(incidents) {
  const [previews, setPreviews] = useState({});

  useEffect(() => {
    const items = (incidents || []).flatMap((inc) =>
      (inc.evidence || []).filter((ev) => ev.available && isPreviewable(ev.mimeType)).map((ev) => ({ incidentId: inc.id, ev })),
    );
    setPreviews(Object.fromEntries(items.map(({ ev }) => [ev.id, { status: 'loading' }])));
    if (!items.length) return undefined;

    let cancelled = false;
    const urls = [];
    (async () => {
      for (const { incidentId, ev } of items) {
        if (cancelled) return;
        let result;
        try {
          const { blob } = await incidentsApi.evidenceBlob(incidentId, ev.id);
          if (cancelled) return;
          const preview = await makePreview(blob, ev.mimeType);
          if (cancelled) {
            URL.revokeObjectURL(preview.url);
            return;
          }
          urls.push(preview.url);
          result = { status: 'ready', ...preview };
        } catch (err) {
          result = { status: 'error', code: err?.code, message: err?.code ? null : errorMessage(err) };
        }
        if (!cancelled) setPreviews((prev) => ({ ...prev, [ev.id]: result }));
      }
    })();

    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [incidents]);

  const all = Object.values(previews);
  return { previews, total: all.length, pending: all.filter((p) => p.status === 'loading').length };
}
