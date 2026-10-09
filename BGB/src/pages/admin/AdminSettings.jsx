import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useToast } from '../../context/ToastContext';
import * as adminApi from '../../api/admin';
import { errorMessage } from '../../api/client';
import useApi from '../../hooks/useApi';
import { formatDateTime } from '../../utils/helpers';
import Card from '../../components/ui/Card';
import { useI18n } from '../../i18n/I18nContext';
import AdminDirectory from './AdminDirectory';
import ConfigRow from './ConfigRow';
import AdminArchive from './AdminArchive';
import AdminMail from './AdminMail';

// Specs #28, #29, #44, #47 — system_config, edited through PATCH /admin/config. The server
// validates types and ranges, applies the change at once and audits old → new values.
const SECTIONS = [
  {
    title: 'set.passwordTitle',
    icon: 'fa-key',
    items: [
      { key: 'password.min_length', icon: 'fa-text-height' },
      { key: 'password.require_uppercase', icon: 'fa-font' },
      { key: 'password.require_number', icon: 'fa-hashtag' },
      { key: 'password.require_special', icon: 'fa-asterisk' },
      { key: 'password.max_attempts', icon: 'fa-user-lock' },
      { key: 'password.lockout_minutes', icon: 'fa-hourglass-half' },
    ],
  },
  {
    title: 'set.sessionTitle',
    icon: 'fa-clock',
    items: [
      { key: 'session.timeout_minutes', icon: 'fa-stopwatch' },
      { key: 'session.single_session', icon: 'fa-desktop' },
    ],
  },
  {
    title: 'set.workflowTitle',
    icon: 'fa-project-diagram',
    items: [{ key: 'workflow.overdue_days', icon: 'fa-hourglass-half' }],
  },
];

export default function AdminSettings({ config, onChange }) {
  const { refreshUser } = useApp();
  const { showToast } = useToast();
  const { t } = useI18n();
  const [busy, setBusy] = useState(null);
  const { data: health, reload: recheck, loading: checking } = useApi(() => adminApi.health(), []);
  const byKey = Object.fromEntries(config.map((r) => [r.key, r]));
  const counters = config.filter((r) => r.key.startsWith('incident.next_id.'));

  // Number fields commit on blur, so each edit is one PATCH and one audit entry
  const save = async (key, value, revert) => {
    setBusy(key);
    try {
      onChange(await adminApi.updateConfig({ [key]: value }));
      if (key.startsWith('session.') || key.startsWith('password.')) refreshUser().catch(() => {}); // own idle timer / rules
      showToast(t('common.saved'), 'success');
    } catch (err) {
      showToast(errorMessage(err), 'error');
      revert?.();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid grid-cols-1 items-start gap-4 sm:gap-6 lg:grid-cols-2">
      {SECTIONS.map((section) => (
        <Card key={section.title} title={t(section.title)} icon={section.icon} bodyClassName="py-1">
          {section.items.map((item) =>
            byKey[item.key] ? <ConfigRow key={`${item.key}:${byKey[item.key].value}`} item={item} row={byKey[item.key]} onSave={save} busy={busy} /> : null,
          )}
        </Card>
      ))}

      <AdminArchive byKey={byKey} onSave={save} busy={busy} />
      <AdminMail />
      <AdminDirectory />

      <Card
        title={t('set.status')}
        icon="fa-server"
        bodyClassName="space-y-3"
        actions={
          <button onClick={recheck} className="btn btn-secondary text-xs" disabled={checking}>
            <i className={`fas fa-sync-alt ${checking ? 'fa-spin' : ''}`} /> {t('set.check')}
          </button>
        }
      >
        <div className="flex items-center justify-between gap-3 rounded-md border border-gray-200/90 bg-gray-50/60 p-3.5 text-xs">
          <span className="font-bold text-gray-800">
            <i className="fas fa-network-wired mr-2 text-bgb-600" />
            {t('set.api')}
          </span>
          {health ? (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-bgb-200/60 bg-bgb-50 px-2.5 py-1 font-bold text-bgb-700">
              <span className="h-2 w-2 rounded-full bg-bgb-500" /> {health.status === 'ok' ? t('set.operational') : health.status}
            </span>
          ) : (
            <span className="font-bold text-gray-400">{checking ? t('set.checking') : t('set.unreachable')}</span>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 rounded-md border border-gray-200/90 bg-gray-50/60 p-3.5 text-xs">
          <span className="font-bold text-gray-800">
            <i className="fas fa-database mr-2 text-bgb-600" />
            {t('set.database')}
          </span>
          {health?.database === 'up' ? (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-bgb-200/60 bg-bgb-50 px-2.5 py-1 font-bold text-bgb-700">
              <span className="h-2 w-2 rounded-full bg-bgb-500" /> {t('set.connected')}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-red-200/60 bg-red-50 px-2.5 py-1 font-bold text-red-700">
              <span className="h-2 w-2 rounded-full bg-red-500" /> {health ? t('set.down') : t('set.unknown')}
            </span>
          )}
        </div>
        {health?.time && <p className="text-xs text-gray-500">{t('set.serverTime', { time: formatDateTime(health.time, { withSeconds: true }) })}</p>}

        {counters.length > 0 && (
          <div className="border-t border-gray-100 pt-3">
            <p className="mb-2 text-xs font-bold text-gray-500">{t('set.nextRefs')}</p>
            {counters.map((c) => (
              <div key={c.key} className="flex justify-between text-xs">
                <span className="text-gray-600">{c.key.split('.').pop()}</span>
                <span className="font-mono font-bold text-bgb-700">
                  BIRDS-{c.key.split('.').pop()}-{String(c.value).padStart(4, '0')}
                </span>
              </div>
            ))}
            <p className="mt-1 text-xs text-gray-400">{t('set.readOnly')}</p>
          </div>
        )}
      </Card>
    </div>
  );
}
