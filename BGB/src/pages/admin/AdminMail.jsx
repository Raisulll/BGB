import { useState } from 'react';
import { useToast } from '../../context/ToastContext';
import * as adminApi from '../../api/admin';
import { errorMessage } from '../../api/client';
import useApi from '../../hooks/useApi';
import { formatDateTime } from '../../utils/helpers';
import Card from '../../components/ui/Card';
import ErrorState from '../../components/ui/ErrorState';
import { useI18n } from '../../i18n/I18nContext';

const STATUS_CLS = {
  sent: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
};

// Spec #23 — workflow e-mail (new submission, approval, rejection, return). Sent by the server
// from an outbox; the SMTP server is configured in the server's .env (SMTP_HOST etc.).
export default function AdminMail() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const { data, error, message, reload } = useApi(() => adminApi.getMail(), []);
  const [sending, setSending] = useState(false);

  const test = async () => {
    setSending(true);
    try {
      const res = await adminApi.sendTestMail();
      showToast(res.sent ? t('mail.testSent', { to: res.to }) : t('mail.testQueued', { to: res.to }), res.sent ? 'success' : 'warning');
      reload();
    } catch (err) {
      showToast(errorMessage(err), 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <Card title={t('mail.title')} icon="fa-envelope" bodyClassName="space-y-3">
      {error ? (
        <ErrorState message={message} onRetry={reload} />
      ) : (
        <>
          <div className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-xs ${data?.enabled ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
            <span className="font-bold text-gray-800">
              <i className="fas fa-paper-plane mr-2 text-bgb-600" />
              {t('mail.delivery')}
            </span>
            <span className={`rounded-md border bg-white px-2 py-0.5 font-bold ${data?.enabled ? 'border-emerald-300 text-emerald-700' : 'border-amber-300 text-amber-700'}`}>
              {!data ? '…' : data.enabled ? (data.server ? t('mail.viaSmtp', { server: data.server }) : t('mail.testMode')) : t('mail.notConfigured')}
            </span>
          </div>
          {data && !data.enabled && <p className="text-[11px] text-gray-500">{t('mail.howTo')}</p>}
          <p className="text-[11px] text-gray-500">{t('mail.events')}</p>
          {data && (
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              {['sent', 'pending', 'failed'].map((k) => (
                <div key={k} className="rounded-lg bg-gray-50 p-2">
                  <p className="text-lg font-black text-gray-900">{data.counts[k]}</p>
                  <p className="text-[10px] text-gray-500">{t(`mail.${k}`)}</p>
                </div>
              ))}
            </div>
          )}
          {data?.recent?.length > 0 && (
            <ul className="space-y-1.5">
              {data.recent.slice(0, 5).map((m) => (
                <li key={m.id} className="flex items-center gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5 text-[11px]">
                  <span className={`shrink-0 rounded border px-1.5 py-0.5 font-bold ${STATUS_CLS[m.status] || ''}`}>{t(`mail.${m.status}`)}</span>
                  <span className="min-w-0 flex-1 truncate text-gray-700" title={m.lastError || m.subject}>
                    {m.subject} → {m.toEmail}
                  </span>
                  <span className="shrink-0 text-gray-400">{formatDateTime(m.sentAt || m.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <div className="border-t border-gray-100 pt-3">
        <button type="button" onClick={test} disabled={sending || !data?.enabled} className="btn btn-secondary text-xs">
          <i className={`fas ${sending ? 'fa-spinner fa-spin' : 'fa-envelope-open-text'}`} /> {t('mail.sendTest')}
        </button>
      </div>
    </Card>
  );
}
