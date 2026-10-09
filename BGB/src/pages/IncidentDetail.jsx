import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import { TILE_ATTRIBUTION, TILE_URL } from '../lib/leaflet';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import * as incidentsApi from '../api/incidents';
import { errorMessage } from '../api/client';
import useApi from '../hooks/useApi';
import { FILE_ICONS, fileKind, formatDateDisplay, formatDateTime, formatFileSize, isAdmin } from '../utils/helpers';
import { SeverityBadge, StatusBadge } from '../components/ui/Badges';
import Card from '../components/ui/Card';
import ErrorState from '../components/ui/ErrorState';
import ReasonDialog from '../components/ui/ReasonDialog';
import Spinner from '../components/ui/Spinner';

function Detail({ label, value }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium text-gray-800">{value || 'N/A'}</dd>
    </div>
  );
}

const ACTION_BTN = {
  return: { label: 'Return', icon: 'fa-undo', cls: 'bg-pink-50 text-pink-600 hover:bg-pink-100' },
  review: { label: 'Review', icon: 'fa-search', cls: 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100' },
  verify: { label: 'Verify', icon: 'fa-check', cls: 'bg-green-50 text-green-600 hover:bg-green-100' },
  reject: { label: 'Reject', icon: 'fa-times', cls: 'bg-red-50 text-red-600 hover:bg-red-100' },
  approve: { label: 'Approve', icon: 'fa-thumbs-up', cls: 'bg-green-50 text-green-700 hover:bg-green-100' },
  close: { label: 'Close', icon: 'fa-lock', cls: 'bg-gray-100 text-gray-700 hover:bg-gray-200' },
};
// The server rejects these without a reason (spec #14)
const NEEDS_REASON = { return: 'Return for corrections', reject: 'Reject incident' };

// Spec #11 — a one-line summary of the preserved media metadata
function metadataSummary(ev) {
  const m = ev.metadata || {};
  if (m.source) return m.source;
  const parts = [];
  const camera = [m.exif?.Make, m.exif?.Model].filter(Boolean).join(' ');
  if (camera) parts.push(camera);
  if (m.exif?.DateTimeOriginal) parts.push(`captured ${formatDateTime(m.exif.DateTimeOriginal)}`);
  if (m.gps) parts.push(`GPS ${m.gps.latitude.toFixed(5)}, ${m.gps.longitude.toFixed(5)}`);
  if (ev.sha256) parts.push(`SHA-256 ${ev.sha256.slice(0, 12)}…`);
  return parts.join(' • ') || 'No embedded metadata';
}

export default function IncidentDetail() {
  const { id } = useParams();
  const { currentUser } = useApp();
  const { showToast } = useToast();
  const { data: inc, error, message, reload, setData } = useApi((signal) => incidentsApi.get(id, signal), [id]);
  const [busy, setBusy] = useState(null);
  const [dialog, setDialog] = useState(null); // { kind: 'workflow', action } | { kind: 'evidence', ev }

  const run = async (action, notes) => {
    setBusy(action);
    try {
      const updated = await incidentsApi.workflow(inc.id, action, notes);
      setData(updated);
      setDialog(null);
      showToast(`${inc.id} ${updated.status.toLowerCase()}`, 'success');
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
      if (r.intact) showToast(`${ev.name}: integrity verified (SHA-256 matches upload)`, 'success');
      else showToast(`${ev.name}: ${r.fileFound ? 'HASH MISMATCH — file has been altered' : 'stored file is missing'}`, 'error');
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
        showToast(`${ev.name} removed`, 'success');
        reload();
      } catch (err) {
        showToast(errorMessage(err), 'error');
      } finally {
        setBusy(null);
      }
    },
    [inc, reload, showToast],
  );

  const closeDialog = useCallback(() => setDialog(null), []);

  if (error) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <Link to="/incidents" className="inline-flex items-center gap-2 text-sm font-medium text-bgb-600 hover:text-bgb-800">
          <i className="fas fa-arrow-left" /> Back to Incidents
        </Link>
        <Card>
          <ErrorState message={error.status === 404 ? `Incident ${id} was not found or is outside your area of responsibility.` : message} onRetry={error.status === 404 ? undefined : reload} />
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
    <div className="mx-auto max-w-6xl space-y-4 sm:space-y-6">
      <Link to="/incidents" className="inline-flex items-center gap-2 text-sm font-medium text-bgb-600 hover:text-bgb-800">
        <i className="fas fa-arrow-left" /> Back to Incidents
      </Link>

      {/* Header */}
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded bg-bgb-50 px-2 py-1 font-mono text-xs text-bgb-700 sm:text-sm">{inc.id}</span>
              <StatusBadge status={inc.status} />
              <SeverityBadge severity={inc.severity} />
            </div>
            <h2 className="text-lg font-bold text-gray-800 sm:text-2xl">{inc.title}</h2>
            <p className="mt-1 text-sm text-gray-500">
              {inc.category} {inc.subcategory && <><i className="fas fa-angle-right mx-1 text-xs" /> {inc.subcategory}</>}
            </p>
          </div>
          {(inc.canEdit || actions.length > 0) && (
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              {inc.canEdit && (
                <Link to={`/incidents/${inc.id}/edit`} className="btn bg-blue-50 text-blue-600 hover:bg-blue-100">
                  <i className="fas fa-edit" /> Edit
                </Link>
              )}
              {actions.map((a) => (
                <button
                  key={a}
                  disabled={Boolean(busy)}
                  onClick={() => (NEEDS_REASON[a] ? setDialog({ kind: 'workflow', action: a }) : run(a))}
                  className={`btn ${ACTION_BTN[a].cls}`}
                >
                  <i className={`fas ${busy === a ? 'fa-spinner fa-spin' : ACTION_BTN[a].icon}`} /> {ACTION_BTN[a].label}
                </button>
              ))}
            </div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-4 sm:space-y-6 lg:col-span-2">
          <Card title="Incident Details" icon="fa-info-circle">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Detail label="Date & Time" value={`${formatDateDisplay(inc.date)} ${inc.time}`} />
              <Detail label="Location" value={inc.location} />
              <Detail label="Sector" value={inc.sector} />
              <Detail label="Battalion" value={inc.battalion} />
              <Detail label="BOP" value={inc.bop} />
              <Detail label="GPS" value={inc.lat != null ? `${inc.lat}, ${inc.lng}` : null} />
            </dl>
            <div className="mt-4 border-t border-gray-100 pt-4">
              <p className="mb-1 text-xs text-gray-500">Description</p>
              <p className="whitespace-pre-line text-sm leading-relaxed text-gray-700">{inc.description || 'N/A'}</p>
            </div>
            <dl className="mt-4 grid grid-cols-1 gap-4 border-t border-gray-100 pt-4 sm:grid-cols-3">
              <Detail label="Persons Involved" value={inc.personsInvolved} />
              <Detail label="Action Taken" value={inc.actionTaken} />
              <Detail label="Outcome" value={inc.outcome} />
            </dl>
          </Card>

          <Card title={`Evidence (${evidence.length})`} icon="fa-paperclip">
            {evidence.length ? (
              <ul className="space-y-2 sm:space-y-3">
                {evidence.map((ev) => {
                  const fi = FILE_ICONS[fileKind(ev.mimeType)] || FILE_ICONS.file;
                  return (
                    <li key={ev.id} className="flex items-center gap-3 rounded-lg bg-gray-50 p-2 sm:p-3">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${fi.cls}`}>
                        <i className={`fas ${fi.icon}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-800">{ev.name}</p>
                        <p className="text-xs text-gray-500">
                          {formatFileSize(ev.size)} • {formatDateTime(ev.uploadedAt)}
                        </p>
                        <p className="truncate text-[11px] text-gray-400" title={ev.sha256 ? `SHA-256 ${ev.sha256}` : undefined}>
                          <i className="fas fa-info-circle mr-1" />
                          {metadataSummary(ev)}
                        </p>
                      </div>
                      {ev.available ? (
                        <div className="flex shrink-0 items-center">
                          {ev.sha256 && (
                            <button onClick={() => verify(ev)} disabled={Boolean(busy)} className="btn btn-ghost px-3 text-emerald-700" title="Verify integrity" aria-label={`Verify integrity of ${ev.name}`}>
                              <i className={`fas ${busy === `vf-${ev.id}` ? 'fa-spinner fa-spin' : 'fa-shield-alt'}`} />
                            </button>
                          )}
                          <button onClick={() => download(ev)} disabled={Boolean(busy)} className="btn btn-ghost px-3 text-bgb-600" title="Download" aria-label={`Download ${ev.name}`}>
                            <i className={`fas ${busy === `dl-${ev.id}` ? 'fa-spinner fa-spin' : 'fa-download'}`} />
                          </button>
                          {canRemoveEvidence && (
                            <button onClick={() => setDialog({ kind: 'evidence', ev })} disabled={Boolean(busy)} className="btn btn-ghost px-3 text-red-600" title="Remove" aria-label={`Remove ${ev.name}`}>
                              <i className="fas fa-trash-alt" />
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="shrink-0 text-[11px] text-gray-400" title="Seed record: metadata only, no stored file">
                          Metadata only
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-gray-400">No evidence attached</p>
            )}
            {inc.canEdit && (
              <Link to={`/incidents/${inc.id}/edit?step=3`} className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-bgb-600 hover:text-bgb-800">
                <i className="fas fa-plus" /> Attach evidence
              </Link>
            )}
          </Card>

          {inc.lat != null && inc.lng != null && (
            <Card title="Location" icon="fa-map-marker-alt" bodyClassName="p-2 sm:p-4">
              <div className="h-64 overflow-hidden rounded-lg sm:h-80">
                <MapContainer center={[inc.lat, inc.lng]} zoom={13} scrollWheelZoom={false} className="h-full w-full">
                  <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
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
        </div>

        {/* Side column */}
        <div className="space-y-4 sm:space-y-6">
          <Card title="Timeline" icon="fa-history">
            <ol className="relative space-y-4">
              {timeline.map((t, i) => {
                const last = i === timeline.length - 1;
                return (
                  <li key={i} className="relative flex gap-3">
                    {!last && <span className="absolute bottom-[-1rem] left-[13px] top-7 w-0.5 bg-gray-200" />}
                    <span className={`z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${last ? 'bg-bgb-500' : 'bg-bgb-100'}`}>
                      <span className={`h-2 w-2 rounded-full ${last ? 'bg-white' : 'bg-bgb-500'}`} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800">{t.action}</p>
                      <p className="text-xs text-gray-500">{t.user}</p>
                      <p className="text-xs text-gray-400">{formatDateTime(t.date)}</p>
                      {t.notes && <p className="mt-1 whitespace-pre-line rounded bg-gray-50 px-2 py-1 text-xs italic text-gray-600">{t.notes}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>

          <Card title="Report Info" icon="fa-user-shield">
            <dl className="space-y-2 text-sm">
              {[
                ['Created By', inc.createdByName || inc.createdBy],
                ['Created', formatDateTime(inc.createdAt)],
                ['Last Updated', formatDateTime(lastUpdate)],
                ['Attachments', evidence.length],
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
        title={dialog?.kind === 'workflow' ? `${NEEDS_REASON[dialog.action]}: ${inc.id}` : ''}
        label="Reason (recorded in the timeline and audit log)"
        confirmLabel={dialog?.kind === 'workflow' ? ACTION_BTN[dialog.action].label : ''}
        confirmClass="btn-danger"
        busy={Boolean(busy)}
        onCancel={closeDialog}
        onConfirm={(reason) => run(dialog.action, reason)}
      />
      <ReasonDialog
        open={dialog?.kind === 'evidence'}
        title={dialog?.kind === 'evidence' ? `Remove ${dialog.ev.name}` : ''}
        label={inc.canEdit ? 'Reason (optional)' : 'Reason (recorded in the timeline and audit log)'}
        required={!inc.canEdit}
        confirmLabel="Remove"
        confirmClass="btn-danger"
        busy={Boolean(busy)}
        onCancel={closeDialog}
        onConfirm={(reason) => removeEvidence(dialog.ev, reason || undefined)}
      />
    </div>
  );
}
