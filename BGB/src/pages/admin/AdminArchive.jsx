import { useState } from 'react';
import { useToast } from '../../context/ToastContext';
import * as adminApi from '../../api/admin';
import { errorMessage } from '../../api/client';
import useApi from '../../hooks/useApi';
import { formatDateTime } from '../../utils/helpers';
import Card from '../../components/ui/Card';
import ErrorState from '../../components/ui/ErrorState';
import { useI18n } from '../../i18n/I18nContext';
import ConfigRow from './ConfigRow';

// Specs #44, #45 — archiving policy, retention policy and an on-demand archiving run. The same run
// happens daily on the server. Records past retention are only counted for review; nothing is
// deleted automatically (DOUBT-012).
export default function AdminArchive({ byKey, onSave, busy }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const { data, error, message, reload, setData } = useApi(() => adminApi.getArchive(), []);
  const [running, setRunning] = useState(false);

  // Re-read the counts after a policy change
  const save = (key, value, revert) => onSave(key, value, revert).then(() => reload());

  const run = async () => {
    setRunning(true);
    try {
      const res = await adminApi.runArchive();
      setData(res.summary);
      showToast(t('arch.ran', { n: res.archived }), 'success');
    } catch (err) {
      showToast(errorMessage(err), 'error');
    } finally {
      setRunning(false);
    }
  };

  const stat = (label, value, cls = 'text-gray-900') => (
    <div className="rounded-lg bg-gray-50 p-2 text-center">
      <p className={`text-lg font-semibold ${cls}`}>{value ?? '–'}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );

  return (
    <Card title={t('arch.title')} icon="fa-archive" bodyClassName="space-y-3">
      {['archive.after_days', 'data.retention_days'].map((key) =>
        byKey[key] ? <ConfigRow key={`${key}:${byKey[key].value}`} item={{ key, icon: key.startsWith('archive') ? 'fa-box-archive' : 'fa-history' }} row={byKey[key]} onSave={save} busy={busy} /> : null,
      )}
      {error ? (
        <ErrorState message={message} onRetry={reload} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {stat(t('arch.active'), data?.active)}
            {stat(t('arch.archived'), data?.archived, 'text-navy-700')}
            {stat(t('arch.due'), data?.dueForArchive, data?.dueForArchive ? 'text-amber-600' : 'text-gray-900')}
            {stat(t('arch.pastRetention'), data?.pastRetention, data?.pastRetention ? 'text-red-600' : 'text-gray-900')}
          </div>
          <p className="text-xs text-gray-500">{t('arch.policy')}</p>
          {data?.lastRun && (
            <p className="text-xs text-gray-500">
              <i className="fas fa-history mr-1" />
              {t('arch.lastRun', { date: formatDateTime(data.lastRun.at) })}
            </p>
          )}
        </>
      )}
      <div className="border-t border-gray-100 pt-3">
        <button type="button" onClick={run} disabled={running} className="btn btn-secondary text-xs">
          <i className={`fas ${running ? 'fa-spinner fa-spin' : 'fa-box-archive'}`} /> {t('arch.runNow')}
        </button>
      </div>
    </Card>
  );
}
