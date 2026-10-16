import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MapContainer, Marker } from '../components/map/Leaflet';
import { BD_LIMIT } from '../lib/leaflet';
import BaseMap from '../components/map/BaseMap';
import BangladeshFrame from '../components/map/BangladeshFrame';
import * as alertsApi from '../api/alerts';
import { errorMessage } from '../api/client';
import { onRealtime } from '../api/realtime';
import useApi from '../hooks/useApi';
import { useAlerts } from '../context/AlertsContext';
import { useToast } from '../context/ToastContext';
import Card from '../components/ui/Card';
import ErrorState from '../components/ui/ErrorState';
import Spinner from '../components/ui/Spinner';
import ReasonDialog from '../components/ui/ReasonDialog';
import { AlertPriorityBadge, AlertStateBadge, useAlertArea } from '../components/alerts/AlertBits';
import { AlertAttachment } from '../components/alerts/AlertMedia';
import { cn, formatDateTime } from '../utils/helpers';
import { useI18n } from '../i18n/I18nContext';

// One Flash Alert (spec #23/#58 extension): the full intelligence, evidence, updates and, for the
// sender, administrators and auditors, who has and hasn't acknowledged.
export default function AlertDetail() {
  const { id } = useParams();
  const { t, tv } = useI18n();
  const { showToast } = useToast();
  const { acknowledge, refresh: refreshActive } = useAlerts();
  const area = useAlertArea();
  const { data: a, error, message, reload, setData } = useApi((signal) => alertsApi.get(id, signal), [id]);
  const [dialog, setDialog] = useState(null); // 'resolve' | 'cancel'
  const [update, setUpdate] = useState('');
  const [busy, setBusy] = useState(null);

  // Live: new updates, acknowledgements and closing show without reloading the page
  useEffect(() => onRealtime((msg) => msg.type === 'alert' && String(msg.alertId) === String(id) && reload()), [id, reload]);

  if (error) return <Card><ErrorState message={error.status === 404 ? t('alerts.notFound') : message} onRetry={error.status === 404 ? undefined : reload} /></Card>;
  if (!a) return <Spinner />;

  const live = a.state === 'active';
  const run = async (key, fn, done) => {
    setBusy(key);
    try {
      const updated = await fn();
      setData(updated);
      refreshActive();
      if (done) showToast(done, 'success');
      return true;
    } catch (err) {
      showToast(errorMessage(err), 'error');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const postUpdate = async (e) => {
    e.preventDefault();
    if (update.trim().length < 3) return;
    if (await run('update', () => alertsApi.postUpdate(a.id, update.trim()), t('alerts.updatePosted'))) setUpdate('');
  };

  const rows = [
    a.subjectName && [t('alerts.form.subjectName'), a.subjectName],
    a.subjectDescription && [t('alerts.form.subjectDescription'), a.subjectDescription],
    (a.lastSeenPlace || a.lastSeenAt) && [t('alerts.lastSeen'), [a.lastSeenPlace, a.lastSeenAt && formatDateTime(a.lastSeenAt)].filter(Boolean).join(' · ')],
    a.lat != null && [t('detail.gps'), `${a.lat.toFixed(5)}, ${a.lng.toFixed(5)}`],
    [t('alerts.area'), area(a)],
    [t('alerts.validUntil'), formatDateTime(a.validUntil)],
    a.incidentId && [t('alerts.linkedIncident'), <Link key="inc" to={`/incidents/${a.incidentId}`} className="font-mono text-bgb-700 hover:underline">{a.incidentId}</Link>],
  ].filter(Boolean);

  return (
    <div className="space-y-4 sm:space-y-6">
      <Link to="/alerts" className="inline-flex items-center gap-2 text-sm font-medium text-bgb-600 hover:text-bgb-800">
        <i className="fas fa-arrow-left" aria-hidden="true" /> {t('alerts.back')}
      </Link>

      {/* Header */}
      <section className={cn('overflow-hidden rounded-lg border', live ? 'border-red-300' : 'border-slate-200')}>
        <div className={cn('flex flex-wrap items-center gap-2 px-4 py-2 text-sm', live ? 'bg-red-700 text-white' : 'bg-slate-100 text-slate-700')}>
          <i className="fas fa-triangle-exclamation" aria-hidden="true" />
          <span className="font-semibold uppercase tracking-wide">{t('alerts.flashAlert')}</span>
          <span className="font-mono">{a.reference}</span>
        </div>
        <div className="space-y-3 bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <AlertPriorityBadge priority={a.priority} />
            <AlertStateBadge state={a.state} />
            <span className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-700">{tv('alertThreat', a.threatType)}</span>
          </div>
          <h2 className="text-xl font-semibold text-slate-900 sm:text-2xl">{a.title}</h2>
          <p className="text-sm text-slate-600">{t('alerts.sentBy', { name: a.sender.name, role: tv('role', a.sender.role), unit: a.sender.scope, time: formatDateTime(a.createdAt) })}</p>
          {a.closedAt && (
            <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
              <span className="font-semibold">{t(`alerts.closedAs.${a.state}`, { name: a.closedByName, time: formatDateTime(a.closedAt) })}</span> {a.closeNote}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {a.me.recipient && !a.me.acknowledgedAt && live && (
              <button type="button" className="btn btn-danger" disabled={Boolean(busy)} onClick={() => run('ack', () => acknowledge(a.id), t('alerts.acknowledged'))}>
                {t('alerts.acknowledge')}
              </button>
            )}
            {a.me.acknowledgedAt && <span className="self-center text-sm font-medium text-emerald-700">{t('alerts.youAcknowledgedAt', { time: formatDateTime(a.me.acknowledgedAt) })}</span>}
            {a.canClose && (
              <>
                <button type="button" className="btn btn-secondary" disabled={Boolean(busy)} onClick={() => setDialog('resolve')}>
                  {t('alerts.resolve')}
                </button>
                <button type="button" className="btn btn-danger-outline" disabled={Boolean(busy)} onClick={() => setDialog('cancel')}>
                  {t('alerts.cancelAlert')}
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
        <div className="space-y-4 sm:space-y-6 lg:col-span-2">
          <Card title={t('alerts.intelligence')} icon="fa-file-shield" bodyClassName="space-y-4 p-4 sm:p-5">
            <p className="whitespace-pre-line leading-relaxed text-slate-800">{a.details}</p>
            <div className="rounded-md border-l-4 border-red-700 bg-red-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-800">{t('alerts.actionRequired')}</p>
              <p className="mt-1 whitespace-pre-line font-medium text-slate-900">{a.instructions}</p>
            </div>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {rows.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-slate-500">{label}</dt>
                  <dd className="text-sm text-slate-900">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          {a.attachments.length > 0 && (
            <Card title={t('alerts.evidence', { n: a.attachments.length })} icon="fa-paperclip" bodyClassName="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
              {a.attachments.map((f) => (
                <AlertAttachment key={f.id} alertId={a.id} file={f} />
              ))}
            </Card>
          )}

          {a.lat != null && a.lng != null && (
            <Card title={t('alerts.lastSeen')} icon="fa-map-marker-alt" bodyClassName="p-2 sm:p-4">
              <div className="h-64 overflow-hidden rounded-lg">
                <MapContainer center={[a.lat, a.lng]} zoom={12} scrollWheelZoom={false} maxBounds={BD_LIMIT} maxBoundsViscosity={1} className="h-full w-full">
                  <BangladeshFrame />
                  <BaseMap />
                  <Marker position={[a.lat, a.lng]} />
                </MapContainer>
              </div>
            </Card>
          )}

          <Card title={t('alerts.updates', { n: a.updates.length })} icon="fa-tower-broadcast" bodyClassName="space-y-3 p-4 sm:p-5">
            {a.updates.length === 0 && <p className="text-sm text-slate-500">{t('alerts.noUpdates')}</p>}
            <ol className="space-y-3">
              {a.updates.map((u) => (
                <li key={u.id} className={cn('rounded-md border p-3 text-sm', u.kind === 'update' ? 'border-slate-200' : 'border-slate-300 bg-slate-50')}>
                  <p className="text-xs text-slate-500">
                    {t(`alerts.updateKind.${u.kind}`)} · {u.user} · {formatDateTime(u.date)}
                  </p>
                  <p className="mt-1 whitespace-pre-line text-slate-900">{u.body}</p>
                </li>
              ))}
            </ol>
            {a.canUpdate && (
              <form onSubmit={postUpdate} className="space-y-2">
                <textarea value={update} onChange={(e) => setUpdate(e.target.value)} rows={3} maxLength={4000} className="form-input" placeholder={t('alerts.updatePh')} aria-label={t('alerts.updatePh')} />
                <div className="flex justify-end">
                  <button type="submit" className="btn btn-primary" disabled={busy === 'update' || update.trim().length < 3}>
                    {busy === 'update' && <i className="fas fa-spinner fa-spin" aria-hidden="true" />}
                    {t('alerts.postUpdate')}
                  </button>
                </div>
              </form>
            )}
          </Card>
        </div>

        <div className="space-y-4 sm:space-y-6">
          <Card title={t('alerts.delivery')} icon="fa-check-double" bodyClassName="space-y-3 p-4">
            <div>
              <p className="text-sm text-slate-700">{t('alerts.ackProgress', { n: a.counts.acknowledged, total: a.counts.recipients })}</p>
              <div className="mt-2 h-2 overflow-hidden rounded bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={a.counts.recipients} aria-valuenow={a.counts.acknowledged}>
                <div className="h-full bg-emerald-600" style={{ width: `${a.counts.recipients ? (100 * a.counts.acknowledged) / a.counts.recipients : 0}%` }} />
              </div>
              <p className="mt-1 text-xs text-slate-500">{t('alerts.deliveredCount', { n: a.counts.delivered, total: a.counts.recipients })}</p>
            </div>
            {a.recipientList && (
              <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto text-sm">
                {a.recipientList.map((r) => (
                  <li key={r.userId} className="py-2">
                    <span className="block min-w-0">
                      <span className="block truncate font-medium text-slate-900">{r.name}</span>
                      <span className="block text-xs text-slate-500">
                        {tv('role', r.role)} · {r.scope}
                      </span>
                    </span>
                    <span className={cn('mt-0.5 block text-xs', r.acknowledgedAt ? 'text-emerald-700' : r.deliveredAt ? 'text-amber-700' : 'text-red-700')}>
                      {r.acknowledgedAt ? t('alerts.ackAt', { time: formatDateTime(r.acknowledgedAt) }) : r.deliveredAt ? t('alerts.seenAt', { time: formatDateTime(r.deliveredAt) }) : t('alerts.notDelivered')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <p className="rounded-md border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-600">{t('alerts.declarationRecord', { name: a.sender.name, time: formatDateTime(a.declarationAt) })}</p>
        </div>
      </div>

      <ReasonDialog
        open={dialog === 'resolve'}
        title={t('alerts.resolveTitle', { ref: a.reference })}
        label={t('alerts.resolveLabel')}
        confirmLabel={t('alerts.resolve')}
        busy={busy === 'close'}
        onCancel={() => setDialog(null)}
        onConfirm={async (notes) => (await run('close', () => alertsApi.resolve(a.id, notes), t('alerts.resolvedToast'))) && setDialog(null)}
      />
      <ReasonDialog
        open={dialog === 'cancel'}
        title={t('alerts.cancelTitle', { ref: a.reference })}
        label={t('alerts.cancelLabel')}
        confirmLabel={t('alerts.cancelAlert')}
        confirmClass="btn-danger"
        busy={busy === 'close'}
        onCancel={() => setDialog(null)}
        onConfirm={async (notes) => (await run('close', () => alertsApi.cancel(a.id, notes), t('alerts.cancelledToast'))) && setDialog(null)}
      />
    </div>
  );
}
