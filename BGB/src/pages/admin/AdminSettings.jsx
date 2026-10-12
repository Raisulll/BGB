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
import { InfoRow, SectionMenu, SettingsSection, StatusText } from './SettingsParts';

// Specs #28, #29, #44, #47 — system_config, edited through PATCH /admin/config. The server
// validates types and ranges, applies the change at once and audits old → new values.
// Layout: system status first, then one column of sections with a section menu on wide screens.
const SECTIONS = [
  {
    id: 'password',
    title: 'set.passwordTitle',
    description: 'set.desc.password',
    icon: 'fa-key',
    items: [
      { key: 'password.min_length' },
      { key: 'password.require_uppercase' },
      { key: 'password.require_number' },
      { key: 'password.require_special' },
      { key: 'password.max_attempts' },
      { key: 'password.lockout_minutes' },
    ],
  },
  {
    id: 'session',
    title: 'set.sessionTitle',
    description: 'set.desc.session',
    icon: 'fa-clock',
    items: [{ key: 'session.timeout_minutes' }, { key: 'session.single_session' }],
  },
  {
    id: 'workflow',
    title: 'set.workflowTitle',
    description: 'set.desc.workflow',
    icon: 'fa-project-diagram',
    items: [{ key: 'workflow.overdue_days' }],
  },
];

export default function AdminSettings({ config, onChange }) {
  const { refreshUser } = useApp();
  const { showToast } = useToast();
  const { t } = useI18n();
  const [busy, setBusy] = useState(null);
  const { data: health, reload: recheckHealth, loading: checkingHealth } = useApi(() => adminApi.health(), []);
  const mail = useApi(() => adminApi.getMail(), []);
  const byKey = Object.fromEntries(config.map((r) => [r.key, r]));
  const counters = config.filter((r) => r.key.startsWith('incident.next_id.'));
  const checking = checkingHealth || mail.loading;

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

  const recheck = () => {
    recheckHealth();
    mail.reload();
  };

  const nav = [
    ...SECTIONS.map((s) => [s.id, t(s.title)]),
    ['archive', t('arch.title')],
    ['mail', t('mail.title')],
    ['directory', t('dir.title')],
    ['refs', t('set.nextRefs')],
  ];
  // Overview tiles: each states its condition in words with an icon
  const apiState = health ? ['ok', health.status === 'ok' ? t('set.operational') : health.status] : [checkingHealth ? 'neutral' : 'bad', checkingHealth ? t('set.checking') : t('set.unreachable')];
  const dbState = health?.database === 'up' ? ['ok', t('set.connected')] : health ? ['bad', t('set.down')] : ['neutral', checkingHealth ? t('set.checking') : t('set.unknown')];
  const m = mail.data;
  const mailState = !m ? ['neutral', mail.error ? t('set.unknown') : t('set.checking')] : m.enabled ? ['ok', m.server ? t('mail.viaSmtp', { server: m.server }) : t('mail.testMode')] : ['warn', t('mail.notConfigured')];
  const tiles = [
    [t('set.api'), apiState],
    [t('set.database'), dbState],
    [t('set.ov.mail'), mailState],
    [t('set.ov.signIn'), ['neutral', t('dir.local')]],
  ];

  return (
    <div className="space-y-6">
      <Card
        title={t('set.status')}
        icon="fa-server"
        actions={
          <button type="button" onClick={recheck} className="btn btn-secondary btn-sm" disabled={checking}>
            <i className={`fas fa-sync-alt ${checking ? 'fa-spin' : ''}`} aria-hidden="true" /> {t('set.check')}
          </button>
        }
      >
        <dl className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {tiles.map(([label, [tone, text]]) => (
            <div key={label} className="min-w-0 rounded-md border border-slate-200 p-3">
              <dt className="text-xs text-slate-600">{label}</dt>
              <dd className="mt-1 truncate">
                <StatusText tone={tone}>{text}</StatusText>
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-slate-600">
          {health?.time && `${t('set.serverTime', { time: formatDateTime(health.time, { withSeconds: true }) })} · `}
          {t('set.auditedNote')}
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <SectionMenu items={nav} prefix="set-" label={t('set.sections')} />

        <div className="min-w-0 space-y-6">
          {SECTIONS.map((section) => (
            <SettingsSection key={section.id} id={`set-${section.id}`} title={t(section.title)} icon={section.icon} description={t(section.description)}>
              {section.items.map((item) =>
                byKey[item.key] ? <ConfigRow key={`${item.key}:${byKey[item.key].value}`} item={item} row={byKey[item.key]} onSave={save} busy={busy} /> : null,
              )}
            </SettingsSection>
          ))}

          <AdminArchive id="set-archive" byKey={byKey} onSave={save} busy={busy} />
          <AdminMail id="set-mail" mail={mail} />
          <AdminDirectory id="set-directory" />

          <SettingsSection id="set-refs" title={t('set.nextRefs')} icon="fa-hashtag" description={t('set.readOnly')}>
            {counters.length === 0 ? (
              <p className="py-4 text-sm text-slate-600">{t('set.noRefs')}</p>
            ) : (
              counters.map((c) => {
                const year = c.key.split('.').pop();
                return (
                  <InfoRow key={c.key} label={year}>
                    <span className="font-mono text-sm font-semibold text-slate-900">
                      BIRDS-{year}-{String(c.value).padStart(4, '0')}
                    </span>
                  </InfoRow>
                );
              })
            )}
          </SettingsSection>
        </div>
      </div>
    </div>
  );
}
