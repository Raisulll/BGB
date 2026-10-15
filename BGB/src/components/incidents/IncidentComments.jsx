import { useState } from 'react';
import * as incidentsApi from '../../api/incidents';
import { errorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { formatDateTime, timeAgo } from '../../utils/helpers';
import Card from '../ui/Card';
import { useI18n } from '../../i18n/I18nContext';

// Discussion on an incident, separate from workflow actions. Comments are append-only on the
// server (part of the record): no edit or delete. The creator and earlier commenters are notified.
const MAX = 4000;

export default function IncidentComments({ incident, onUpdated }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const comments = incident.comments || [];

  const post = async (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      onUpdated(await incidentsApi.comment(incident.id, body));
      setText('');
    } catch (err) {
      showToast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={t('detail.comments', { n: comments.length })} icon="fa-comments" id="comments">
      {comments.length ? (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="rounded-lg bg-gray-50 p-3">
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-xs font-bold text-gray-800">{c.user}</span>
                <span className="text-xs text-gray-400" title={formatDateTime(c.date)}>
                  {timeAgo(c.date, t)}
                </span>
              </div>
              <p className="whitespace-pre-line text-sm text-gray-700">{c.body}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-400">{t('detail.noComments')}</p>
      )}

      {incident.canComment ? (
        <form onSubmit={post} className="mt-4 space-y-2 border-t border-gray-100 pt-4">
          <label htmlFor="comment-body" className="sr-only">
            {t('detail.commentLabel')}
          </label>
          <textarea
            id="comment-body"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX))}
            rows={3}
            placeholder={t('detail.commentPh')}
            className="form-input resize-y"
            disabled={busy}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-gray-400">{t('detail.commentNote')}</span>
            <button type="submit" disabled={busy || !text.trim()} className="btn btn-primary shrink-0">
              <i className={`fas ${busy ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`} /> {t('detail.commentPost')}
            </button>
          </div>
        </form>
      ) : (
        incident.status !== 'Draft' && <p className="mt-3 text-xs text-gray-400">{t(incident.archivedAt ? 'detail.commentsArchived' : 'detail.commentsReadOnly')}</p>
      )}
    </Card>
  );
}
