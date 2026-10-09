import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useToast } from '../../context/ToastContext';
import * as adminApi from '../../api/admin';
import { errorMessage } from '../../api/client';
import { formatDateDisplay, todayISO } from '../../utils/helpers';
import Card from '../../components/ui/Card';
import { DemoBadge, DemoButton, DemoNotice, Sample } from '../../components/ui/Demo';
import { ConfigRow } from './AdminSettings';

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
  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-2">
          {title} <DemoBadge />
          <span className="text-[10px] font-medium text-gray-400">Spec {spec}</span>
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

const STATUS_DOT = { ok: 'bg-emerald-500', standby: 'bg-amber-400' };

export default function AdminOperations({ config, onChange }) {
  const { showToast } = useToast();
  const { refreshUser } = useApp();
  const [busy, setBusy] = useState(null);
  const backupRow = config.find((c) => c.key === 'backup.frequency_hours');

  // The backup interval is a real stored setting; only the job that would use it is deferred
  const save = async (key, value, revert) => {
    setBusy(key);
    try {
      onChange(await adminApi.updateConfig({ [key]: value }));
      refreshUser().catch(() => {});
      showToast('Setting saved (no backup job runs in the demo version)', 'success');
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
        <p className="font-bold">Demo version: operations features are shown for evaluation only.</p>
        <p className="mt-0.5">
          Backups, disaster recovery, high availability, load testing and log management are part of the production deployment. On this tab the buttons do not
          perform any action, and values marked <Sample>sample</Sample> are illustrative, not measurements.
        </p>
      </DemoNotice>

      <div className="grid grid-cols-1 items-start gap-4 sm:gap-6 lg:grid-cols-2">
        {/* #34 Backup */}
        <DemoCard
          title="Backup & Restore"
          icon="fa-database"
          spec="#34"
          actions={
            <>
              <DemoButton icon="fa-play" feature="Manual backup">Run Backup Now</DemoButton>
              <DemoButton icon="fa-undo" feature="Restore from backup">Restore</DemoButton>
              <DemoButton icon="fa-check-double" feature="Backup verification">Verify Latest</DemoButton>
            </>
          }
        >
          {backupRow && (
            <ConfigRow
              key={`backup:${backupRow.value}`}
              item={{ key: backupRow.key, label: 'Backup Interval (hours)', hint: 'Stored policy value used by the production backup job', icon: 'fa-calendar-alt', demo: true }}
              row={backupRow}
              onSave={save}
              busy={busy}
            />
          )}
          <KV label="Method">pg_dump, compressed, AES-256 encrypted, copied off-site</KV>
          <KV label="Evidence files">Included in each backup</KV>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Size</th>
                  <th className="px-3 py-2">Checksum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[0, 1, 2].map((n) => (
                  <tr key={n}>
                    <td className="px-3 py-2"><Sample>{daysAgo(n)} 02:00</Sample></td>
                    <td className="px-3 py-2"><Sample>Full</Sample></td>
                    <td className="px-3 py-2"><Sample>{(48.6 - n * 0.4).toFixed(1)} MB</Sample></td>
                    <td className="px-3 py-2"><Sample>Verified</Sample></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DemoCard>

        {/* #35 DR */}
        <DemoCard title="Disaster Recovery" icon="fa-building-shield" spec="#35" actions={<DemoButton icon="fa-random" feature="Failover drill">Run Failover Drill</DemoButton>}>
          <KV label="Primary site"><Sample>HQ Data Centre, Pilkhana</Sample></KV>
          <KV label="DR site"><Sample>Secondary data centre</Sample></KV>
          <KV label="Replication">PostgreSQL streaming replication + evidence storage sync</KV>
          <KV label="Replication lag"><Sample>2 s</Sample></KV>
          <KV label="Recovery point objective (RPO)"><Sample>24 hours</Sample></KV>
          <KV label="Recovery time objective (RTO)"><Sample>4 hours</Sample></KV>
        </DemoCard>

        {/* #36 HA */}
        <DemoCard title="High Availability" icon="fa-server" spec="#36">
          <div className="space-y-2">
            {[
              ['Load balancer', 'Nginx (TLS termination)', 'ok'],
              ['Application node 1', 'PM2 cluster, 4 workers', 'ok'],
              ['Application node 2', 'PM2 cluster, 4 workers', 'ok'],
              ['Database primary', 'PostgreSQL', 'ok'],
              ['Database replica', 'PostgreSQL hot standby', 'standby'],
            ].map(([name, detail, st]) => (
              <div key={name} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 text-xs">
                <span className="flex items-center gap-2 font-semibold text-gray-800">
                  <span className={`h-2 w-2 rounded-full ${STATUS_DOT[st]}`} />
                  {name}
                </span>
                <Sample>{detail}{st === 'standby' ? ' (standby)' : ''}</Sample>
              </div>
            ))}
          </div>
        </DemoCard>

        {/* #38–#40 Performance */}
        <DemoCard title="Performance & Availability" icon="fa-tachometer-alt" spec="#38–#40" actions={<DemoButton icon="fa-vial" feature="Load test">Run Load Test</DemoButton>}>
          <KV label="Concurrent users target">100 / 250 / 500 (DOUBT-001)</KV>
          <KV label="Response time target">under 3 seconds</KV>
          <KV label="Availability target">99.5%</KV>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-3 py-2">Virtual users</th>
                  <th className="px-3 py-2">p95 response</th>
                  <th className="px-3 py-2">Errors</th>
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
          <KV label="Uptime, last 30 days"><Sample>99.9%</Sample></KV>
        </DemoCard>

        {/* #48 Logs */}
        <DemoCard
          title="Logs & Monitoring"
          icon="fa-file-alt"
          spec="#48"
          actions={
            <>
              <DemoButton icon="fa-download" feature="Log download">Download Logs</DemoButton>
              <DemoButton icon="fa-share-square" feature="SIEM forwarding">Forward to SIEM</DemoButton>
            </>
          }
        >
          <KV label="Log streams">Application, error, security, HTTP access (recorded now)</KV>
          <KV label="Rotation">Daily, kept 90 days</KV>
          <p className="pt-1 text-[11px] font-bold uppercase tracking-wider text-gray-500">Last 24 hours</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ['Errors', '0'],
              ['Failed logins', '3'],
              ['Active sessions', '7'],
            ].map(([label, v]) => (
              <div key={label} className="rounded-lg bg-gray-50 p-2">
                <Sample>{v}</Sample>
                <p className="mt-1 text-[10px] text-gray-500">{label}</p>
              </div>
            ))}
          </div>
        </DemoCard>
      </div>
    </div>
  );
}
