import { useState } from 'react';
import { useToast } from '../../context/ToastContext';
import * as adminApi from '../../api/admin';
import { errorMessage } from '../../api/client';
import useApi from '../../hooks/useApi';
import { formatDateTime } from '../../utils/helpers';
import ErrorState from '../../components/ui/ErrorState';
import { useI18n } from '../../i18n/I18nContext';
import ConfigRow from './ConfigRow';
import { SettingsSection, StatGrid } from './SettingsParts';

// Specs #44, #45 — archiving policy, retention policy and an on-demand archiving run. The same run
// happens daily on the server. Records past retention are only counted for review; nothing is
// deleted automatically (DOUBT-012).
export default function AdminArchive({ id, byKey, onSave, busy }) {
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

  return (
    <SettingsSection
      id={id}
      title={t('arch.title')}
      icon="fa-archive"
      description={t('arch.policy')}
      footer={
        <>
          <button type="button" onClick={run} disabled={running} className="btn btn-secondary btn-sm">
            <i className={`fas ${running ? 'fa-spinner fa-spin' : 'fa-box-archive'}`} aria-hidden="true" /> {t('arch.runNow')}
          </button>
          {data?.lastRun && <span className="text-xs text-slate-600">{t('arch.lastRun', { date: formatDateTime(data.lastRun.at) })}</span>}
        </>
      }
    >
      {['archive.after_days', 'data.retention_days'].map((key) =>
        byKey[key] ? <ConfigRow key={`${key}:${byKey[key].value}`} item={{ key }} row={byKey[key]} onSave={save} busy={busy} /> : null,
      )}
      {error ? (
        <div className="py-4">
          <ErrorState message={message} onRetry={reload} />
        </div>
      ) : (
        <StatGrid
          items={[
            { label: t('arch.active'), value: data?.active },
            { label: t('arch.archived'), value: data?.archived },
            { label: t('arch.due'), value: data?.dueForArchive, tone: data?.dueForArchive ? 'text-amber-700' : undefined },
            { label: t('arch.pastRetention'), value: data?.pastRetention, tone: data?.pastRetention ? 'text-red-700' : undefined },
          ]}
        />
      )}
    </SettingsSection>
  );
}
