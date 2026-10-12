import { useState } from 'react';
import { useToast } from '../../context/ToastContext';
import * as adminApi from '../../api/admin';
import { errorMessage } from '../../api/client';
import { formatDateTime } from '../../utils/helpers';
import { InfoRow, SettingsSection, StatGrid, StatusText } from './SettingsParts';
import ErrorState from '../../components/ui/ErrorState';
import { useI18n } from '../../i18n/I18nContext';

const STATUS_TONE = { sent: 'ok', pending: 'warn', failed: 'bad' };

// Spec #23 — workflow e-mail (new submission, approval, rejection, return). Sent by the server
// from an outbox; the SMTP server is configured in the server's .env (SMTP_HOST etc.).
// `mail` is the useApi() result for GET /admin/mail, shared with the status overview.
export default function AdminMail({ id, mail }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const { data, error, message, reload } = mail;
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
    <SettingsSection
      id={id}
      title={t('mail.title')}
      icon="fa-envelope"
      description={t('mail.events')}
      footer={
        <>
          <button type="button" onClick={test} disabled={sending || !data?.enabled} className="btn btn-secondary btn-sm">
            <i className={`fas ${sending ? 'fa-spinner fa-spin' : 'fa-envelope-open-text'}`} aria-hidden="true" /> {t('mail.sendTest')}
          </button>
          {data && !data.enabled && <span className="text-xs text-slate-600">{t('mail.testNeedsSmtp')}</span>}
        </>
      }
    >
      {error ? (
        <div className="py-4">
          <ErrorState message={message} onRetry={reload} />
        </div>
      ) : (
        <>
          <InfoRow label={t('mail.delivery')}>
            {!data ? (
              <StatusText>{t('set.checking')}</StatusText>
            ) : data.enabled ? (
              <StatusText tone="ok">{data.server ? t('mail.viaSmtp', { server: data.server }) : t('mail.testMode')}</StatusText>
            ) : (
              <StatusText tone="warn">{t('mail.notConfigured')}</StatusText>
            )}
          </InfoRow>
          {data && !data.enabled && <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{t('mail.howTo')}</p>}
          {data && <StatGrid items={['sent', 'pending', 'failed'].map((k) => ({ label: t(`mail.${k}`), value: data.counts[k], tone: k === 'failed' && data.counts.failed ? 'text-red-700' : undefined }))} />}
          {data?.recent?.length > 0 && (
            <div className="mb-4">
              <h4 className="mb-1 text-xs font-semibold text-slate-600">{t('mail.recent')}</h4>
              <ul className="divide-y divide-slate-200 rounded-md border border-slate-200">
                {data.recent.slice(0, 5).map((m) => (
                  <li key={m.id} className="flex flex-col gap-1 px-3 py-2 text-xs sm:flex-row sm:items-center sm:gap-3">
                    <span className="shrink-0 sm:w-24">
                      <StatusText tone={STATUS_TONE[m.status]}>{t(`mail.${m.status}`)}</StatusText>
                    </span>
                    <span className="min-w-0 flex-1 truncate text-slate-700" title={m.lastError || m.subject}>
                      {m.subject} → {m.toEmail}
                    </span>
                    <span className="shrink-0 text-slate-500">{formatDateTime(m.sentAt || m.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </SettingsSection>
  );
}
