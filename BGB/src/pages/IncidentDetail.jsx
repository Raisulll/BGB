import { useCallback, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import { BD_LIMIT, TILE_ATTRIBUTION, TILE_URL } from '../lib/leaflet';
import BangladeshFrame from '../components/map/BangladeshFrame';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import * as incidentsApi from '../api/incidents';
import { errorMessage } from '../api/client';
import useApi from '../hooks/useApi';
import { FILE_ICONS, fileKind, formatDateDisplay, formatDateTime, formatFileSize, isAdmin } from '../utils/helpers';
import { daysWaiting, OverdueBadge, SeverityBadge, StatusBadge } from '../components/ui/Badges';
import IncidentComments from '../components/incidents/IncidentComments';
import PrintableIncident from '../components/incidents/PrintableIncident';
import PrintPreview from '../components/reports/PrintPreview';
import useEvidencePreviews from '../hooks/useEvidencePreviews';
import ReasonBanner from '../components/incidents/ReasonBanner';
import RelatedIncidents from '../components/incidents/RelatedIncidents';
import Card from '../components/ui/Card';
import EvidenceMedia, { PREVIEW_TYPES } from '../components/incidents/EvidenceMedia';
import ErrorState from '../components/ui/ErrorState';
import ReasonDialog from '../components/ui/ReasonDialog';
import Spinner from '../components/ui/Spinner';
import { useI18n } from '../i18n/I18nContext';

function Detail({ label, value }) {
  const { t } = useI18n();
  return (
    <div className="min-w-0">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-gray-800">{value || t('common.na')}</dd>
    </div>
  );
}

// The forward step is the primary action; Return is secondary; Reject is destructive
const ACTION_BTN = {
  review: { cls: 'btn-primary', order: 0 },
  verify: { cls: 'btn-primary', order: 0 },
  approve: { cls: 'btn-primary', order: 0 },
  close: { cls: 'btn-primary', order: 0 },
  return: { cls: 'btn-secondary', order: 1 },
  reject: { cls: 'btn-danger-outline', order: 2 },
};
// The server rejects these without a reason (spec #14); value = dialog title key
const NEEDS_REASON = { return: 'detail.returnTitle', reject: 'detail.rejectTitle' };

// Spec #11 — a one-line summary of the preserved media metadata
function metadataSummary(ev, t) {
  const m = ev.metadata || {};
  if (m.source) return m.source;
  const parts = [];
  const camera = [m.exif?.Make, m.exif?.Model].filter(Boolean).join(' ');
  if (camera) parts.push(camera);
  if (m.exif?.DateTimeOriginal) parts.push(t('detail.captured', { date: formatDateTime(m.exif.DateTimeOriginal) }));
  if (m.gps) parts.push(`GPS ${m.gps.latitude.toFixed(5)}, ${m.gps.longitude.toFixed(5)}`);
  // Office/OpenDocument properties
  if (m.document?.author) parts.push(t('detail.docAuthor', { name: m.document.author }));
  if (m.document?.created) parts.push(t('detail.docCreated', { date: formatDateTime(m.document.created) }));
  if (m.document?.modified) parts.push(t('detail.docModified', { date: formatDateTime(m.document.modified) }));
  if (ev.sha256) parts.push(`SHA-256 ${ev.sha256.slice(0, 12)}…`);
  return parts.join(' • ') || t('detail.noMetadata');
}

export default function IncidentDetail() {
  const { id } = useParams();
  // Opened from the GIS map: the back link returns to the map as it was left
  const location = useLocation();
  const mapBack = location.state?.backTo?.startsWith('/map') ? location.state.backTo : null;
  const navigate = useNavigate();
  const { currentUser } = useApp();
  const { showToast } = useToast();
  const { t, tv } = useI18n();
  const { data: inc, error, message, reload, setData } = useApi((signal) => incidentsApi.get(id, signal), [id]);
  const [busy, setBusy] = useState(null);
  const [dialog, setDialog] = useState(null); // { kind: 'workflow', action } | { kind: 'evidence', ev }

  const run = async (action, notes) => {
    setBusy(action);
    try {
      const updated = await incidentsApi.workflow(inc.id, action, notes);
      setData(updated);
      setDialog(null);
      showToast(t('incidents.actionDone', { id: inc.id, status: tv('status', updated.status) }), 'success');
    } catch (err) {
      showToast(errorMessage(err), 'error');
      // 409: someone else acted first; show the current state
      if (err?.status === 409) reload();
    } finally {
      setBusy(null);
    }
  };

  const download = async (ev) => {
    setBusy(`dl-${ev.id}`);
    try {
      await incidentsApi.downloadEvidence(inc.id, ev.id, ev.name);
    } catch (err) {
      showToast(errorMessage(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  const verify = async (ev) => {
    setBusy(`vf-${ev.id}`);
    try {
      const r = await incidentsApi.verifyEvidence(inc.id, ev.id);
      if (r.intact) showToast(t('detail.intact', { name: ev.name }), 'success');
      else showToast(t(r.fileFound ? 'detail.mismatch' : 'detail.missing', { name: ev.name }), 'error');
    } catch (err) {
      showToast(errorMessage(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  const removeEvidence = useCallback(
    async (ev, reason) => {
      setBusy(`rm-${ev.id}`);
      try {
        await incidentsApi.removeEvidence(inc.id, ev.id, reason);
        setDialog(null);
        showToast(t('detail.removed', { name: ev.name }), 'success');
        reload();
      } catch (err) {
        showToast(errorMessage(err), 'error');
      } finally {
        setBusy(null);
      }
    },
    [inc, reload, showToast, t],
  );

  // Spec #45 — archive a final record / restore it (HQ administrators)
  const archive = async () => {
    if (!window.confirm(t('detail.archiveConfirm', { id: inc.id }))) return;
    setBusy('archive');
    try {
      setData(await incidentsApi.archive(inc.id));
      showToast(t('detail.archived', { id: inc.id }), 'success');
    } catch (err) {
      showToast(errorMessage(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  const restore = async (reason) => {
    setBusy('restore');
    try {
      setData(await incidentsApi.restore(inc.id, reason));
      setDialog(null);
      showToast(t('detail.restored', { id: inc.id }), 'success');
    } catch (err) {
      showToast(errorMessage(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  // Print / Save as PDF: "Print" opens a preview of the formal document; printing from the preview
  // first gets a document reference from the server (audited), then the browser prints exactly the
  // preview. No audit entry, no print. Evidence previews load only while the preview is open.
  const [previewOpen, setPreviewOpen] = useState(false);
  const [printed, setPrinted] = useState(null); // { reference, printedAt }
  const previewIncidents = useMemo(() => (previewOpen && inc ? [inc] : null), [previewOpen, inc]);
  const { previews, total: previewTotal, pending: previewPending } = useEvidencePreviews(previewIncidents);
  const print = async () => {
    setBusy('print');
    try {
      setPrinted(await incidentsApi.recordPrint(inc.id));
      setTimeout(() => window.print(), 50); // let the reference number render first
    } catch (err) {
      showToast(errorMessage(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  // The creator discards a never-submitted draft; it disappears from every list
  const discard = async (reason) => {
    setBusy('discard');
    try {
      await incidentsApi.discard(inc.id, reason || undefined);
      showToast(t('detail.discarded', { id: inc.id }), 'success');
      navigate('/incidents?view=drafts');
    } catch (err) {
      showToast(errorMessage(err), 'error');
      setBusy(null);
    }
  };

  const closeDialog = useCallback(() => setDialog(null), []);

  if (error) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <Link to={mapBack || '/incidents'} className="inline-flex items-center gap-2 text-sm font-medium text-bgb-600 hover:text-bgb-800">
          <i className="fas fa-arrow-left" /> {mapBack ? t('map.backToMap') : t('detail.back')}
        </Link>
        <Card>
          <ErrorState message={error.status === 404 ? t('detail.notFound', { id }) : message} onRetry={error.status === 404 ? undefined : reload} />
        </Card>
      </div>
    );
  }
  if (!inc) return <Spinner />;

  const actions = inc.actions || [];
  const evidence = inc.evidence || [];
  const timeline = inc.timeline || [];
  const lastUpdate = timeline[timeline.length - 1]?.date || inc.updatedAt;
  // Creator may remove while editing; an HQ admin at any stage, with a reason (server-enforced)
  const canRemoveEvidence = inc.canEdit || isAdmin(currentUser);

  return (
    <>
      <div className="mx-auto max-w-6xl space-y-4 sm:space-y-6 print:hidden">
        <Link to={mapBack || '/incidents'} className="inline-flex items-center gap-2 text-sm font-medium text-bgb-600 hover:text-bgb-800">
          <i className="fas fa-arrow-left" /> {mapBack ? t('map.backToMap') : t('detail.back')}
        </Link>

        {/* Header */}
        <Card>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded bg-bgb-50 px-2 py-1 font-mono text-xs text-bgb-700 sm:text-sm">{inc.id}</span>
                <StatusBadge status={inc.status} />
                <SeverityBadge severity={inc.severity} />
                {inc.overdue && <OverdueBadge since={inc.statusChangedAt} />}
              </div>
              <h2 className="text-lg font-bold text-gray-800 sm:text-2xl">{inc.title}</h2>
              <p className="mt-1 text-sm text-gray-500">
                {inc.category} {inc.subcategory && <><i className="fas fa-angle-right mx-1 text-xs" /> {inc.subcategory}</>}
              </p>
              {inc.statusChangedAt && !['Closed', 'Rejected'].includes(inc.status) && (
                <p className={`mt-1 text-xs ${inc.overdue ? 'font-semibold text-red-600' : 'text-gray-400'}`}>
                  <i className="fas fa-clock mr-1" />
                  {daysWaiting(inc.statusChangedAt)
                  ? t('detail.inStatusSince', { status: tv('status', inc.status), date: formatDateTime(inc.statusChangedAt), n: daysWaiting(inc.statusChangedAt) })
                  : t('detail.inStatusSinceToday', { status: tv('status', inc.status), date: formatDateTime(inc.statusChangedAt) })}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              {inc.canEdit && (
                <Link to={`/incidents/${inc.id}/edit`} className="btn btn-secondary">
                  {t('common.edit')}
                </Link>
              )}
              {/* Spec #14 — a reviewer modifies the report before approval (reason required, audited) */}
              {!inc.canEdit && inc.canModify && (
                <Link to={`/incidents/${inc.id}/edit`} className="btn btn-secondary">
                  {t('detail.modify')}
                </Link>
              )}
              {[...actions].sort((x, y) => ACTION_BTN[x].order - ACTION_BTN[y].order).map((a) => (
                <button
                  key={a}
                  disabled={Boolean(busy)}
                  onClick={() => (NEEDS_REASON[a] ? setDialog({ kind: 'workflow', action: a }) : run(a))}
                  className={`btn ${ACTION_BTN[a].cls}`}
                >
                  {busy === a && <i className="fas fa-spinner fa-spin" aria-hidden="true" />}
                  {tv('action', a)}
                </button>
              ))}
              {inc.canDiscard && (
                <button id="discard-draft" disabled={Boolean(busy)} onClick={() => setDialog({ kind: 'discard' })} className="btn btn-danger-outline">
                  {busy === 'discard' && <i className="fas fa-spinner fa-spin" aria-hidden="true" />}
                  {t('detail.discard')}
                </button>
              )}
              {inc.canArchive && (
                <button disabled={Boolean(busy)} onClick={archive} className="btn btn-secondary">
                  {busy === 'archive' && <i className="fas fa-spinner fa-spin" aria-hidden="true" />}
                  {t('detail.archive')}
                </button>
              )}
              {inc.canRestore && (
                <button disabled={Boolean(busy)} onClick={() => setDialog({ kind: 'restore' })} className="btn btn-secondary">
                  {t('detail.restore')}
                </button>
              )}
              <button id="print-incident" disabled={Boolean(busy)} onClick={() => setPreviewOpen(true)} className="btn btn-secondary" title={t('detail.printHint')}>
                {t('detail.print')}
              </button>
            </div>
          </div>
          {inc.archivedAt && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-navy-200 bg-navy-50 p-3 text-xs text-navy-800">
              <i className="fas fa-box-archive mt-0.5" />
              <span>{t('detail.archivedBanner', { date: formatDateTime(inc.archivedAt) })}</span>
            </div>
          )}
          <ReasonBanner incident={inc} className="mt-4" />
        </Card>

        <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
          {/* Main column */}
          <div className="space-y-4 sm:space-y-6 lg:col-span-2">
            <Card title={t('detail.details')} icon="fa-info-circle">
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Detail label={t('detail.dateTime')} value={`${formatDateDisplay(inc.date)} ${inc.time}`} />
                <Detail label={t('common.location')} value={inc.location} />
                <Detail label={t('common.sector')} value={inc.sector} />
                <Detail label={t('common.battalion')} value={inc.battalion} />
                <Detail label={t('common.bop')} value={inc.bop} />
                <Detail label={t('detail.gps')} value={inc.lat != null ? `${inc.lat}, ${inc.lng}` : null} />
              </dl>
              <div className="mt-4 border-t border-gray-100 pt-4">
                <p className="mb-1 text-xs text-gray-500">{t('detail.description')}</p>
                <p className="whitespace-pre-line text-sm leading-relaxed text-gray-700">{inc.description || t('common.na')}</p>
              </div>
              <dl className="mt-4 grid grid-cols-1 gap-4 border-t border-gray-100 pt-4 sm:grid-cols-3">
                <Detail label={t('detail.persons')} value={inc.personsInvolved} />
                <Detail label={t('detail.actionTaken')} value={inc.actionTaken} />
                <Detail label={t('detail.outcome')} value={inc.outcome} />
              </dl>
            </Card>

            <Card title={t('detail.evidence', { n: evidence.length })} icon="fa-paperclip">
              {evidence.length ? (
                <ul className="space-y-2 sm:space-y-3">
                  {evidence.map((ev) => {
                    const fi = FILE_ICONS[fileKind(ev.mimeType)] || FILE_ICONS.file;
                    return (
                      <li key={ev.id} className="rounded-lg bg-gray-50 p-2 sm:p-3">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${fi.cls}`}>
                            <i className={`fas ${fi.icon}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-gray-800">{ev.name}</p>
                            <p className="text-xs text-gray-500">
                              {formatFileSize(ev.size)} • {formatDateTime(ev.uploadedAt)}
                            </p>
                            <p className="truncate text-xs text-gray-400" title={ev.sha256 ? `SHA-256 ${ev.sha256}` : undefined}>
                              <i className="fas fa-info-circle mr-1" />
                              {metadataSummary(ev, t)}
                            </p>
                          </div>
                          {ev.available ? (
                            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                              {ev.sha256 && (
                                <button onClick={() => verify(ev)} disabled={Boolean(busy)} className="btn btn-sm btn-secondary" title={t('detail.verifyIntegrity')} aria-label={t('detail.verifyAria', { name: ev.name })}>
                                {busy === `vf-${ev.id}` && <i className="fas fa-spinner fa-spin" aria-hidden="true" />}
                                {t('detail.verify')}
                                </button>
                              )}
                              <button onClick={() => download(ev)} disabled={Boolean(busy)} className="btn btn-sm btn-secondary" title={t('common.download')} aria-label={t('detail.downloadAria', { name: ev.name })}>
                                {busy === `dl-${ev.id}` && <i className="fas fa-spinner fa-spin" aria-hidden="true" />}
                                {t('common.download')}
                              </button>
                              {canRemoveEvidence && (
                                <button onClick={() => setDialog({ kind: 'evidence', ev })} disabled={Boolean(busy)} className="btn btn-sm btn-danger-outline" title={t('common.remove')} aria-label={t('detail.removeAria', { name: ev.name })}>
                                {t('common.remove')}
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="shrink-0 text-xs text-gray-400" title={t('detail.metadataOnlyTitle')}>
                              {t('detail.metadataOnly')}
                            </span>
                          )}
                        </div>
                        {ev.available && PREVIEW_TYPES.has(ev.mimeType) && <EvidenceMedia incidentId={inc.id} evidence={ev} />}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-gray-400">{t('detail.noEvidence')}</p>
              )}
              {inc.canEdit && (
                <Link to={`/incidents/${inc.id}/edit?step=3`} className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-bgb-600 hover:text-bgb-800">
                  <i className="fas fa-plus" /> {t('detail.attach')}
                </Link>
              )}
            </Card>

            {inc.lat != null && inc.lng != null && (
              <Card title={t('detail.location')} icon="fa-map-marker-alt" bodyClassName="p-2 sm:p-4">
                <div className="h-64 overflow-hidden rounded-lg sm:h-80">
                  <MapContainer center={[inc.lat, inc.lng]} zoom={13} scrollWheelZoom={false} maxBounds={BD_LIMIT} maxBoundsViscosity={1} className="h-full w-full">
                    <BangladeshFrame />
                    <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} bounds={BD_LIMIT} noWrap />
                    <Marker position={[inc.lat, inc.lng]}>
                      <Popup>
                        <b>{inc.id}</b>
                        <br />
                        {inc.title}
                      </Popup>
                    </Marker>
                  </MapContainer>
                </div>
              </Card>
            )}
            <IncidentComments incident={inc} onUpdated={setData} />
          </div>

          {/* Side column */}
          <div className="space-y-4 sm:space-y-6">
            <Card title={t('detail.timeline')} icon="fa-history">
              <ol className="relative space-y-4">
                {timeline.map((ev, i) => {
                  const last = i === timeline.length - 1;
                  return (
                    <li key={i} className="relative flex gap-3">
                      {!last && <span className="absolute bottom-[-1rem] left-[13px] top-7 w-0.5 bg-gray-200" />}
                      <span className={`z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${last ? 'bg-bgb-500' : 'bg-bgb-100'}`}>
                        <span className={`h-2 w-2 rounded-full ${last ? 'bg-white' : 'bg-bgb-500'}`} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800">{tv('timeline', ev.action)}</p>
                        <p className="text-xs text-gray-500">{ev.user}</p>
                        <p className="text-xs text-gray-400">{formatDateTime(ev.date)}</p>
                        {ev.notes && <p className="mt-1 whitespace-pre-line rounded bg-gray-50 px-2 py-1 text-xs italic text-gray-600">{ev.notes}</p>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </Card>

            <RelatedIncidents incidentId={inc.id} />

            <Card title={t('detail.reportInfo')} icon="fa-user-shield">
              <dl className="space-y-2 text-sm">
                {[
                  [t('detail.createdBy'), inc.createdByName || inc.createdBy],
                  [t('detail.created'), formatDateTime(inc.createdAt)],
                  [t('detail.lastUpdated'), formatDateTime(lastUpdate)],
                  [t('detail.attachments'), evidence.length],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4">
                    <dt className="text-gray-500">{k}</dt>
                    <dd className="text-right font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>
        </div>

        <ReasonDialog
          open={dialog?.kind === 'workflow'}
          title={dialog?.kind === 'workflow' ? t(NEEDS_REASON[dialog.action], { id: inc.id }) : ''}
          label={t('common.reasonRecorded')}
          confirmLabel={dialog?.kind === 'workflow' ? tv('action', dialog.action) : ''}
          confirmClass="btn-danger"
          busy={Boolean(busy)}
          onCancel={closeDialog}
          onConfirm={(reason) => run(dialog.action, reason)}
        />
        <ReasonDialog
          open={dialog?.kind === 'restore'}
          title={t('detail.restoreTitle', { id: inc.id })}
          label={t('common.reasonRecorded')}
          confirmLabel={t('detail.restore')}
          busy={Boolean(busy)}
          onCancel={closeDialog}
          onConfirm={restore}
        />
        <ReasonDialog
          open={dialog?.kind === 'evidence'}
          title={dialog?.kind === 'evidence' ? t('detail.removeTitle', { name: dialog.ev.name }) : ''}
          label={inc.canEdit ? t('common.reasonOptional') : t('common.reasonRecorded')}
          required={!inc.canEdit}
          confirmLabel={t('common.remove')}
          confirmClass="btn-danger"
          busy={Boolean(busy)}
          onCancel={closeDialog}
          onConfirm={(reason) => removeEvidence(dialog.ev, reason || undefined)}
        />
        <ReasonDialog
          open={dialog?.kind === 'discard'}
          title={t('detail.discardTitle', { id: inc.id })}
          label={t('detail.discardHint')}
          required={false}
          confirmLabel={t('detail.discard')}
          confirmClass="btn-danger"
          busy={Boolean(busy)}
          onCancel={closeDialog}
          onConfirm={discard}
        />
      </div>
      {previewOpen && (
        <PrintPreview
          onClose={() => setPreviewOpen(false)}
          onPrint={print}
          printing={busy === 'print'}
          preparing={previewPending > 0}
          status={previewPending > 0 ? t('rep.preparingEvidence', { n: previewTotal - previewPending, total: previewTotal }) : null}
        >
          <PrintableIncident incident={inc} printed={printed} previews={previews} />
        </PrintPreview>
      )}
    </>
  );
}
