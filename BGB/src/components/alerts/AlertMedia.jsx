import { useEffect, useState } from 'react';
import * as alertsApi from '../../api/alerts';
import { downloadFrom, errorMessage } from '../../api/client';
import { FILE_ICONS, fileKind, formatFileSize } from '../../utils/helpers';
import { useI18n } from '../../i18n/I18nContext';

const VIEWABLE = new Set(['image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'video/quicktime']);

/** One attachment: photos and videos shown in place (fetched with the access token), other files downloaded. */
export function AlertAttachment({ alertId, file, compact = false }) {
  const { t } = useI18n();
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(null);
  const viewable = VIEWABLE.has(file.mimeType);

  useEffect(() => {
    if (!viewable) return undefined;
    let revoked = false;
    let objectUrl = null;
    alertsApi
      .attachmentBlob(alertId, file.id)
      .then(({ blob }) => {
        if (revoked) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((err) => !revoked && setError(errorMessage(err)));
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [alertId, file.id, viewable]);

  const fi = FILE_ICONS[fileKind(file.mimeType)] || FILE_ICONS.file;
  const download = () => downloadFrom(file.downloadUrl.replace(/^\/api\/v1/, '')).catch(() => {});

  return (
    <figure className="overflow-hidden rounded-md border border-slate-200 bg-white">
      {viewable && (
        <div className={`flex items-center justify-center bg-slate-900 ${compact ? 'h-40' : 'h-64'}`}>
          {error ? (
            <p className="px-3 text-center text-xs text-red-200">{error}</p>
          ) : !url ? (
            <i className="fas fa-spinner fa-spin text-slate-400" aria-hidden="true" />
          ) : file.mimeType.startsWith('image/') ? (
            <img src={url} alt={file.name} className="h-full w-full object-contain" />
          ) : (
            <video src={url} controls className="h-full w-full" />
          )}
        </div>
      )}
      <figcaption className="flex items-center gap-3 p-2.5">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded ${fi.cls}`}>
          <i className={`fas ${fi.icon} text-xs`} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-slate-900">{file.name}</span>
          <span className="block text-xs text-slate-500">{formatFileSize(file.size)} · SHA-256 {file.sha256.slice(0, 12)}…</span>
        </span>
        <button type="button" onClick={download} className="btn btn-secondary btn-sm">
          {t('common.download')}
        </button>
      </figcaption>
    </figure>
  );
}
