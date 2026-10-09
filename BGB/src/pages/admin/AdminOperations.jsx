import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useToast } from '../../context/ToastContext';
import * as adminApi from '../../api/admin';
import { errorMessage } from '../../api/client';
import { formatDateDisplay, todayISO } from '../../utils/helpers';
import Card from '../../components/ui/Card';
import { DemoBadge, DemoButton, DemoNotice, Sample } from '../../components/ui/Demo';
import ConfigRow from './ConfigRow';
import { useI18n } from '../../i18n/I18nContext';

// Operations features deferred for the demo version (user decision 2026-10-09):
// #34 backups, #35 disaster recovery, #36 high availability, #38–#40 load/performance/availability,
// #48 log rotation and monitoring summary. They are laid out here as they will appear in production;
// nothing on this tab is functional and every illustrative value is marked SAMPLE.
// Production designs: CLAUDE.md §22 (backup/DR), §25 (logging), §26 (performance).

const daysAgo = (n) => {
  const [y, m, d] = todayISO().split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d - n));
  return formatDateDisplay(dt.toISOString().slice(0, 10));
};

function DemoCard({ title, icon, spec, children, actions }) {
  const { t } = useI18n();
  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-2">
          {title} <DemoBadge />
          <span className="text-xs font-medium text-gray-400">{t('ops.spec', { n: spec })}</span>
        </span>
      }
      icon={icon}
      bodyClassName="space-y-3"
      className="border-violet-100"
    >
      {children}
      {actions && <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">{actions}</div>}
    </Card>
  );
}

function KV({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 text-xs">
      <span className="text-gray-600">{label}</span>
      <span className="text-right font-semibold text-gray-800">{children}</span>
    </div>
  );
}

const STATUS_DOT = { ok: 'bg-bgb-500', standby: 'bg-amber-400' };

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

  return (
    <div className="space-y-4 sm:space-y-6">
      <DemoNotice>
        <p className="font-bold">{t('ops.noticeTitle')}</p>
        <p className="mt-0.5">
          {t('ops.noticeBody')} <Sample>{t('ops.noticeSample')}</Sample> {t('ops.noticeEnd')}
        </p>
      </DemoNotice>

      <div className="grid grid-cols-1 items-start gap-4 sm:gap-6 lg:grid-cols-2">
        {/* #34 Backup */}
        <DemoCard
          title={t('ops.backupTitle')}
          icon="fa-database"
          spec="#34"
          actions={
            <>
              <DemoButton icon="fa-play">{t('ops.runBackup')}</DemoButton>
              <DemoButton icon="fa-undo">{t('ops.restore')}</DemoButton>
              <DemoButton icon="fa-check-double">{t('ops.verifyLatest')}</DemoButton>
            </>
          }
        >
          {backupRow && (
            <ConfigRow
              key={`backup:${backupRow.value}`}
              item={{ key: backupRow.key, icon: 'fa-calendar-alt', demo: true }}
              row={backupRow}
              onSave={save}
              busy={busy}
            />
          )}
          <KV label={t('ops.method')}>{t('ops.methodValue')}</KV>
          <KV label={t('ops.evidenceFiles')}>{t('ops.evidenceIncluded')}</KV>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-3 py-2">{t('common.date')}</th>
                  <th className="px-3 py-2">{t('ops.thType')}</th>
                  <th className="px-3 py-2">{t('ops.thSize')}</th>
                  <th className="px-3 py-2">{t('ops.thChecksum')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[0, 1, 2].map((n) => (
                  <tr key={n}>
                    <td className="px-3 py-2"><Sample>{daysAgo(n)} 02:00</Sample></td>
                    <td className="px-3 py-2"><Sample>{t('ops.full')}</Sample></td>
                    <td className="px-3 py-2"><Sample>{(48.6 - n * 0.4).toFixed(1)} MB</Sample></td>
                    <td className="px-3 py-2"><Sample>{t('ops.verified')}</Sample></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DemoCard>

        {/* #35 DR */}
        <DemoCard title={t('ops.drTitle')} icon="fa-building-shield" spec="#35" actions={<DemoButton icon="fa-random">{t('ops.drill')}</DemoButton>}>
          <KV label={t('ops.primary')}><Sample>HQ Data Centre, Pilkhana</Sample></KV>
          <KV label={t('ops.drSite')}><Sample>Secondary data centre</Sample></KV>
          <KV label={t('ops.replication')}>{t('ops.replicationValue')}</KV>
          <KV label={t('ops.lag')}><Sample>2 s</Sample></KV>
          <KV label={t('ops.rpo')}><Sample>{t('ops.hours', { n: 24 })}</Sample></KV>
          <KV label={t('ops.rto')}><Sample>{t('ops.hours', { n: 4 })}</Sample></KV>
        </DemoCard>

        {/* #36 HA */}
        <DemoCard title={t('ops.haTitle')} icon="fa-server" spec="#36">
          <div className="space-y-2">
            {[
              ['ops.node.lb', 'Nginx (TLS termination)', 'ok'],
              ['ops.node.app1', 'PM2 cluster, 4 workers', 'ok'],
              ['ops.node.app2', 'PM2 cluster, 4 workers', 'ok'],
              ['ops.node.dbPrimary', 'PostgreSQL', 'ok'],
              ['ops.node.dbReplica', 'PostgreSQL hot standby', 'standby'],
            ].map(([name, detail, st]) => (
              <div key={name} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 text-xs">
                <span className="flex items-center gap-2 font-semibold text-gray-800">
                  <span className={`h-2 w-2 rounded-full ${STATUS_DOT[st]}`} />
                  {t(name)}
                </span>
                <Sample>
                  {detail}
                  {st === 'standby' ? ` (${t('ops.standby')})` : ''}
                </Sample>
              </div>
            ))}
          </div>
        </DemoCard>

        {/* #38–#40 Performance */}
        <DemoCard title={t('ops.perfTitle')} icon="fa-tachometer-alt" spec="#38–#40" actions={<DemoButton icon="fa-vial">{t('ops.loadTest')}</DemoButton>}>
          <KV label={t('ops.usersTarget')}>100 / 250 / 500 (DOUBT-001)</KV>
          <KV label={t('ops.responseTarget')}>{t('ops.responseValue')}</KV>
          <KV label={t('ops.availabilityTarget')}>99.5%</KV>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-3 py-2">{t('ops.thVu')}</th>
                  <th className="px-3 py-2">{t('ops.thP95')}</th>
                  <th className="px-3 py-2">{t('ops.thErrors')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[
                  [100, '0.4 s', '0%'],
                  [250, '0.9 s', '0%'],
                  [500, '1.8 s', '0.1%'],
                ].map(([vu, p95, errs]) => (
                  <tr key={vu}>
                    <td className="px-3 py-2 font-semibold">{vu}</td>
                    <td className="px-3 py-2"><Sample>{p95}</Sample></td>
                    <td className="px-3 py-2"><Sample>{errs}</Sample></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <KV label={t('ops.uptime')}><Sample>99.9%</Sample></KV>
        </DemoCard>

        {/* #48 Logs */}
        <DemoCard
          title={t('ops.logsTitle')}
          icon="fa-file-alt"
          spec="#48"
          actions={
            <>
              <DemoButton icon="fa-download">{t('ops.downloadLogs')}</DemoButton>
              <DemoButton icon="fa-share-square">{t('ops.siem')}</DemoButton>
            </>
          }
        >
          <KV label={t('ops.streams')}>{t('ops.streamsValue')}</KV>
          <KV label={t('ops.rotation')}>{t('ops.rotationValue')}</KV>
          <p className="pt-1 text-xs font-bold text-gray-500">{t('ops.last24')}</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ['ops.errors', '0'],
              ['ops.failedLogins', '3'],
              ['ops.activeSessions', '7'],
            ].map(([label, v]) => (
              <div key={label} className="rounded-lg bg-gray-50 p-2">
                <Sample>{v}</Sample>
                <p className="mt-1 text-xs text-gray-500">{t(label)}</p>
              </div>
            ))}
          </div>
        </DemoCard>
      </div>
    </div>
  );
}
