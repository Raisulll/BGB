import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAlerts } from '../../context/AlertsContext';
import { useToast } from '../../context/ToastContext';
import { errorMessage } from '../../api/client';
import { startTone } from '../../utils/tones';
import { formatDateTime } from '../../utils/helpers';
import { useI18n } from '../../i18n/I18nContext';
import { AlertPriorityBadge, useAlertArea } from './AlertBits';
import { AlertAttachment } from './AlertMedia';

/**
 * Flash Alert takeover: an alert addressed to this user and not yet acknowledged covers the whole
 * screen with a siren (and vibration on phones) until it is acknowledged. The siren can be
 * silenced (an officer may need to stay quiet); the screen can't be dismissed without acknowledging.
 */
export default function AlertTakeover() {
  const { pending, acknowledge } = useAlerts();
  const { showToast } = useToast();
  const { t, tv } = useI18n();
  const area = useAlertArea();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [silenced, setSilenced] = useState(() => new Set());
  const alert = pending[0];
  const sounding = Boolean(alert) && !silenced.has(alert.id);

  // Siren and vibration while an unacknowledged alert is on screen
  useEffect(() => {
    if (!sounding) return undefined;
    const stop = startTone('alarm');
    const buzz = () => navigator.vibrate?.([700, 300, 700, 300, 700]);
    buzz();
    const timer = setInterval(buzz, 4000);
    return () => {
      stop();
      clearInterval(timer);
      navigator.vibrate?.(0);
    };
  }, [sounding, alert?.id]);

  // Each new alert opens at its top (the band and title), with keyboard focus on Acknowledge
  useEffect(() => {
    if (!alert) return undefined;
    document.getElementById('flash-takeover')?.scrollTo(0, 0);
    document.getElementById('flash-ack')?.focus({ preventScroll: true });
    return undefined;
  }, [alert?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!alert) return null;
  const photo = alert.attachments.find((f) => f.mimeType.startsWith('image/'));

  const ack = async (open) => {
    setBusy(true);
    try {
      await acknowledge(alert.id);
      if (open) navigate(`/alerts/${alert.id}`);
    } catch (err) {
      showToast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div id="flash-takeover" className="fixed inset-0 z-[120] flex flex-col overflow-y-auto bg-red-950 text-white print:hidden" role="alertdialog" aria-modal="true" aria-labelledby="flash-title" aria-describedby="flash-details">
      {/* Band */}
      <div className="flex flex-wrap items-center gap-3 bg-red-700 px-4 py-3 sm:px-8">
        <i className="fas fa-triangle-exclamation text-2xl" aria-hidden="true" />
        <p className="text-xl font-semibold uppercase tracking-[0.2em] sm:text-2xl">{t('alerts.flashAlert')}</p>
        <span className="font-mono text-sm text-red-100">{alert.reference}</span>
        <span className="ml-auto text-sm text-red-100">{pending.length > 1 && t('alerts.morePending', { n: pending.length - 1 })}</span>
      </div>

      <div className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-6 px-4 py-6 sm:px-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <AlertPriorityBadge priority={alert.priority} />
            <span className="rounded border border-red-400/60 px-2 py-0.5 text-xs font-medium text-red-100">{tv('alertThreat', alert.threatType)}</span>
            <span className="text-sm text-red-100">{t('alerts.areaLabel', { area: area(alert) })}</span>
          </div>
          <h2 id="flash-title" className="text-2xl font-semibold leading-tight sm:text-3xl">
            {alert.title}
          </h2>

          <dl id="flash-details" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {(alert.subjectName || alert.subjectDescription) && (
              <div className="sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-red-200">{t('alerts.subject')}</dt>
                <dd className="mt-1 text-base">
                  {alert.subjectName && <span className="font-semibold">{alert.subjectName}</span>}
                  {alert.subjectName && alert.subjectDescription && ' — '}
                  {alert.subjectDescription}
                </dd>
              </div>
            )}
            {(alert.lastSeenPlace || alert.lastSeenAt) && (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-red-200">{t('alerts.lastSeen')}</dt>
                <dd className="mt-1">
                  {alert.lastSeenPlace}
                  {alert.lastSeenAt && <span className="block text-sm text-red-100">{formatDateTime(alert.lastSeenAt)}</span>}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-red-200">{t('alerts.validUntil')}</dt>
              <dd className="mt-1">{formatDateTime(alert.validUntil)}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-red-200">{t('alerts.intelligence')}</dt>
              <dd className="mt-1 whitespace-pre-line leading-relaxed">{alert.details}</dd>
            </div>
          </dl>

          <div className="rounded-md border-2 border-white bg-white p-4 text-slate-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-700">{t('alerts.actionRequired')}</p>
            <p className="mt-1 whitespace-pre-line text-base font-medium">{alert.instructions}</p>
          </div>

          <p className="text-sm text-red-100">
            {t('alerts.sentBy', { name: alert.sender.name, role: tv('role', alert.sender.role), unit: alert.sender.scope, time: formatDateTime(alert.createdAt) })}
            {alert.attachments.length > 0 && ` · ${t('alerts.attachmentsCount', { n: alert.attachments.length })}`}
          </p>
        </div>

        <div className="space-y-4">
          {photo && <AlertAttachment alertId={alert.id} file={photo} compact />}
          <div className="space-y-2 rounded-md bg-red-900/60 p-4">
            <button id="flash-ack" type="button" onClick={() => ack(false)} disabled={busy} className="btn w-full bg-white text-base font-semibold text-red-800 hover:bg-red-50">
              {busy && <i className="fas fa-spinner fa-spin" aria-hidden="true" />}
              {t('alerts.acknowledge')}
            </button>
            <button type="button" onClick={() => ack(true)} disabled={busy} className="btn w-full border-white/70 text-white hover:bg-red-800">
              {t('alerts.acknowledgeOpen')}
            </button>
            {sounding && (
              <button type="button" onClick={() => setSilenced((s) => new Set(s).add(alert.id))} className="btn w-full text-red-100 hover:bg-red-800">
                <i className="fas fa-volume-xmark" aria-hidden="true" />
                {t('alerts.silence')}
              </button>
            )}
            <p className="pt-1 text-xs leading-snug text-red-200">{t('alerts.ackNote')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
