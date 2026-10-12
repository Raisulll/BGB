import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useToast } from '../../context/ToastContext';
import * as adminApi from '../../api/admin';
import { errorMessage } from '../../api/client';
import { formatDateDisplay, todayISO } from '../../utils/helpers';
import Card from '../../components/ui/Card';
import { DemoBadge, DemoButton, DemoNotice, Sample } from '../../components/ui/Demo';
import ConfigRow from './ConfigRow';
import { InfoRow, SectionMenu, SettingsSection, StatGrid, StatusText } from './SettingsParts';
import { useI18n } from '../../i18n/I18nContext';

// Operations features deferred for the demo version (user decision 2026-10-09):
// #34 backups, #35 disaster recovery, #36 high availability, #38–#40 load/performance/availability,
// #48 log rotation and monitoring summary. They are laid out here as they will appear in production;
// nothing on this tab is functional and every illustrative value is marked SAMPLE.
// Production designs: CLAUDE.md §22 (backup/DR), §25 (logging), §26 (performance).
// Same layout as Security & system: overview first, then one column of sections with a menu.

const daysAgo = (n) => {
  const [y, m, d] = todayISO().split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d - n));
  return formatDateDisplay(dt.toISOString().slice(0, 10));
};

const AREAS = [
  { id: 'backup', title: 'ops.backupTitle', icon: 'fa-database', spec: '#34' },
  { id: 'dr', title: 'ops.drTitle', icon: 'fa-building-shield', spec: '#35' },
  { id: 'ha', title: 'ops.haTitle', icon: 'fa-server', spec: '#36' },
  { id: 'perf', title: 'ops.perfTitle', icon: 'fa-tachometer-alt', spec: '#38–#40' },
  { id: 'logs', title: 'ops.logsTitle', icon: 'fa-file-alt', spec: '#48' },
];

/** Table inside a demo section; value cells are Samples (`plainFirst`: the first column is real, e.g. targets) */
function SampleTable({ head, rows, plainFirst = false }) {
  return (
    <div className="my-4 overflow-x-auto rounded-md border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            {head.map((h) => (
              <th key={h} className="th">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {rows.map((cells) => (
            <tr key={cells[0]}>
              {cells.map((c, i) => (
                <td key={i} className="whitespace-nowrap px-3 py-2">
                  {plainFirst && i === 0 ? <span className="font-medium text-slate-900">{c}</span> : <Sample>{c}</Sample>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminOperations({ config, onChange }) {
  const { showToast } = useToast();
  const { t } = useI18n();
  const { refreshUser } = useApp();
  const [busy, setBusy] = useState(null);
  const backupRow = config.find((c) => c.key === 'backup.frequency_hours');

  // The backup interval is a real stored setting; only the job that would use it is deferred
  const save = async (key, value, revert) => {
    setBusy(key);
    try {
      onChange(await adminApi.updateConfig({ [key]: value }));
      refreshUser().catch(() => {});
      showToast(t('set.savedNoBackup'), 'success');
    } catch (err) {
      showToast(errorMessage(err), 'error');
      revert?.();
    } finally {
      setBusy(null);
    }
  };

  const titleOf = (area) => (
    <span className="flex flex-wrap items-center gap-2">
      {t(area.title)} <DemoBadge />
      <span className="text-xs font-normal text-slate-500">{t('ops.spec', { n: area.spec })}</span>
    </span>
  );
  const section = (id) => {
    const area = AREAS.find((a) => a.id === id);
    return { id: `ops-${id}`, title: titleOf(area), icon: area.icon, description: t(`ops.desc.${id}`) };
  };

  return (
    <div className="space-y-6">
      <DemoNotice>
        <p className="font-semibold">{t('ops.noticeTitle')}</p>
        <p className="mt-0.5">
          {t('ops.noticeBody')} <Sample>{t('ops.noticeSample')}</Sample> {t('ops.noticeEnd')}
        </p>
      </DemoNotice>

      {/* What production adds, area by area */}
      <Card title={t('ops.overviewTitle')} icon="fa-clipboard-list">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-5">
          {AREAS.map((a) => (
            <div key={a.id} className="flex min-w-0 flex-col rounded-md border border-slate-200 p-3">
              <dt className="text-sm font-medium text-slate-900">{t(a.title)}</dt>
              <dd className="text-xs text-slate-500">{t('ops.spec', { n: a.spec })}</dd>
              <dd className="mt-2 text-xs text-slate-600">{t(`ops.sum.${a.id}`)}</dd>
              <dd className="mt-auto pt-3">
                <StatusText>{t('ops.plannedProduction')}</StatusText>
              </dd>
            </div>
          ))}
        </dl>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <SectionMenu items={AREAS.map((a) => [a.id, t(a.title)])} prefix="ops-" label={t('ops.sections')} />

        <div className="min-w-0 space-y-6">
          {/* #34 Backup */}
          <SettingsSection
            {...section('backup')}
            footer={
              <>
                <DemoButton icon="fa-play" className="btn-secondary btn-sm">{t('ops.runBackup')}</DemoButton>
                <DemoButton icon="fa-undo" className="btn-secondary btn-sm">{t('ops.restore')}</DemoButton>
                <DemoButton icon="fa-check-double" className="btn-secondary btn-sm">{t('ops.verifyLatest')}</DemoButton>
              </>
            }
          >
            {backupRow && <ConfigRow key={`backup:${backupRow.value}`} item={{ key: backupRow.key, demo: true }} row={backupRow} onSave={save} busy={busy} />}
            <InfoRow label={t('ops.method')}><span className="text-sm text-slate-900">{t('ops.methodValue')}</span></InfoRow>
            <InfoRow label={t('ops.evidenceFiles')}><span className="text-sm text-slate-900">{t('ops.evidenceIncluded')}</span></InfoRow>
            <h4 className="mt-4 text-xs font-semibold text-slate-600">{t('ops.recentBackups')}</h4>
            <SampleTable
              head={[t('common.date'), t('ops.thType'), t('ops.thSize'), t('ops.thChecksum')]}
              rows={[0, 1, 2].map((n) => [`${daysAgo(n)} 02:00`, t('ops.full'), `${(48.6 - n * 0.4).toFixed(1)} MB`, t('ops.verified')])}
            />
          </SettingsSection>

          {/* #35 DR */}
          <SettingsSection {...section('dr')} footer={<DemoButton icon="fa-random" className="btn-secondary btn-sm">{t('ops.drill')}</DemoButton>}>
            <InfoRow label={t('ops.primary')}><Sample>HQ Data Centre, Pilkhana</Sample></InfoRow>
            <InfoRow label={t('ops.drSite')}><Sample>Secondary data centre</Sample></InfoRow>
            <InfoRow label={t('ops.replication')}><span className="text-sm text-slate-900">{t('ops.replicationValue')}</span></InfoRow>
            <InfoRow label={t('ops.lag')}><Sample>2 s</Sample></InfoRow>
            <InfoRow label={t('ops.rpo')}><Sample>{t('ops.hours', { n: 24 })}</Sample></InfoRow>
            <InfoRow label={t('ops.rto')}><Sample>{t('ops.hours', { n: 4 })}</Sample></InfoRow>
          </SettingsSection>

          {/* #36 HA */}
          <SettingsSection {...section('ha')}>
            {[
              ['ops.node.lb', 'Nginx (TLS termination)', 'active'],
              ['ops.node.app1', 'PM2 cluster, 4 workers', 'active'],
              ['ops.node.app2', 'PM2 cluster, 4 workers', 'active'],
              ['ops.node.dbPrimary', 'PostgreSQL', 'active'],
              ['ops.node.dbReplica', 'PostgreSQL hot standby', 'standby'],
            ].map(([name, detail, state]) => (
              <InfoRow key={name} label={<span className="font-medium text-slate-900">{t(name)}</span>}>
                <span className="inline-flex flex-wrap items-center gap-2 sm:justify-end">
                  <Sample>{detail}</Sample>
                  <Sample>{t(`ops.state.${state}`)}</Sample>
                </span>
              </InfoRow>
            ))}
          </SettingsSection>

          {/* #38–#40 Performance */}
          <SettingsSection {...section('perf')} footer={<DemoButton icon="fa-vial" className="btn-secondary btn-sm">{t('ops.loadTest')}</DemoButton>}>
            <InfoRow label={t('ops.usersTarget')}><span className="text-sm text-slate-900">100 / 250 / 500 (DOUBT-001)</span></InfoRow>
            <InfoRow label={t('ops.responseTarget')}><span className="text-sm text-slate-900">{t('ops.responseValue')}</span></InfoRow>
            <InfoRow label={t('ops.availabilityTarget')}><span className="text-sm text-slate-900">99.5%</span></InfoRow>
            <InfoRow label={t('ops.uptime')}><Sample>99.9%</Sample></InfoRow>
            <h4 className="mt-4 text-xs font-semibold text-slate-600">{t('ops.loadResults')}</h4>
            <SampleTable
              head={[t('ops.thVu'), t('ops.thP95'), t('ops.thErrors')]}
              plainFirst
              rows={[
                ['100', '0.4 s', '0%'],
                ['250', '0.9 s', '0%'],
                ['500', '1.8 s', '0.1%'],
              ]}
            />
          </SettingsSection>

          {/* #48 Logs */}
          <SettingsSection
            {...section('logs')}
            footer={
              <>
                <DemoButton icon="fa-download" className="btn-secondary btn-sm">{t('ops.downloadLogs')}</DemoButton>
                <DemoButton icon="fa-share-square" className="btn-secondary btn-sm">{t('ops.siem')}</DemoButton>
              </>
            }
          >
            <InfoRow label={t('ops.streams')}><span className="text-sm text-slate-900">{t('ops.streamsValue')}</span></InfoRow>
            <InfoRow label={t('ops.rotation')}><span className="text-sm text-slate-900">{t('ops.rotationValue')}</span></InfoRow>
            <h4 className="mt-4 text-xs font-semibold text-slate-600">{t('ops.last24')}</h4>
            <StatGrid
              items={[
                ['ops.errors', '0'],
                ['ops.failedLogins', '3'],
                ['ops.activeSessions', '7'],
              ].map(([label, v]) => ({ label: t(label), value: <Sample>{v}</Sample> }))}
            />
          </SettingsSection>
        </div>
      </div>
    </div>
  );
}
