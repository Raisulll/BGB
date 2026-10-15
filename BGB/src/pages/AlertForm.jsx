import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as alertsApi from '../api/alerts';
import { errorMessage } from '../api/client';
import useApi, { useDebounced } from '../hooks/useApi';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import Card from '../components/ui/Card';
import Modal from '../components/ui/Modal';
import Spinner from '../components/ui/Spinner';
import ErrorState from '../components/ui/ErrorState';
import { cn, EVIDENCE_EXTENSIONS, EVIDENCE_TYPES, FILE_ICONS, fileKind, formatFileSize, isAllowedEvidenceFile } from '../utils/helpers';
import { useI18n } from '../i18n/I18nContext';

// Raise a Flash Alert (spec #23/#58 extension). Needs the "raise_alert" permission (App.jsx and
// server). The sender must accept the false-alert declaration; the server records when.
const MAX_FILE_MB = 50;
const MAX_FILES = 10;

const EMPTY = {
  title: '',
  threatType: 'wanted_person',
  priority: 'flash',
  subjectName: '',
  subjectDescription: '',
  details: '',
  instructions: '',
  lastSeenPlace: '',
  lastSeenAt: '',
  lat: '',
  lng: '',
  validHours: 24,
  incidentId: '',
};

function Field({ label, hint, error, required, children, className = '' }) {
  const { t } = useI18n();
  return (
    <div className={className}>
      <label className="form-label mb-1 block text-sm font-medium text-slate-800">
        {label} {required && <span className="text-red-700" aria-hidden="true">*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p className="mt-1 text-xs font-medium text-red-700">{error === true ? t('common.required') : error}</p>}
    </div>
  );
}

export default function AlertForm() {
  const { t, tv } = useI18n();
  const { showToast } = useToast();
  const { currentUser } = useApp();
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const { data: opts, error: optsError, message: optsMessage, reload } = useApi((signal) => alertsApi.options(signal), []);

  const [form, setForm] = useState(EMPTY);
  const [allUnits, setAllUnits] = useState(false);
  const [sectors, setSectors] = useState(() => (/^Sector-/.test(currentUser?.scope || '') ? [currentUser.scope] : []));
  const [files, setFiles] = useState([]);
  const [declared, setDeclared] = useState(false);
  const [errors, setErrors] = useState({});
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);

  const target = useMemo(() => (allUnits ? [] : sectors), [allUnits, sectors]);
  const debouncedTarget = useDebounced(target.join(','), 300);
  const areaChosen = allUnits || sectors.length > 0;
  const { data: reach } = useApi((signal) => alertsApi.preview(debouncedTarget ? debouncedTarget.split(',') : [], signal), [debouncedTarget], { enabled: areaChosen });

  if (optsError) return <Card><ErrorState message={optsMessage} onRetry={reload} /></Card>;
  if (!opts) return <Spinner />;

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    if (errors[key]) setErrors((x) => ({ ...x, [key]: false }));
  };
  const toggleSector = (s) => setSectors((list) => (list.includes(s) ? list.filter((x) => x !== s) : [...list, s]));

  const pickFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    const ok = [];
    for (const f of picked) {
      if (!isAllowedEvidenceFile(f)) showToast(t('form.badType', { name: f.name }), 'error');
      else if (f.size > MAX_FILE_MB * 1024 * 1024) showToast(t('form.tooBig', { name: f.name, mb: MAX_FILE_MB }), 'error');
      else ok.push(f);
    }
    setFiles((list) => [...list, ...ok].slice(0, MAX_FILES));
  };

  const validate = () => {
    const found = {};
    if (form.title.trim().length < 5) found.title = t('common.minChars', { min: 5 });
    if (form.details.trim().length < 20) found.details = t('common.minChars', { min: 20 });
    if (form.instructions.trim().length < 5) found.instructions = t('common.minChars', { min: 5 });
    if (!areaChosen) found.area = t('alerts.form.areaRequired');
    if ((form.lat === '') !== (form.lng === '')) found.lat = t('form.bothCoords');
    if (form.lat !== '' && !(Number(form.lat) >= -90 && Number(form.lat) <= 90)) found.lat = t('form.latRange');
    if (form.lng !== '' && !(Number(form.lng) >= -180 && Number(form.lng) <= 180)) found.lng = t('form.lngRange');
    if (form.incidentId && !/^BIRDS-\d{4}-\d{4,}$/.test(form.incidentId.trim())) found.incidentId = t('alerts.form.incidentFormat');
    if (!declared) found.declaration = t('alerts.form.declarationRequired');
    return found;
  };

  const review = (e) => {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) {
      showToast(t('form.completeFields'), 'error');
      return;
    }
    setConfirming(true);
  };

  const send = async () => {
    setSending(true);
    try {
      const created = await alertsApi.raise(
        {
          title: form.title.trim(),
          threatType: form.threatType,
          priority: form.priority,
          subjectName: form.subjectName.trim() || null,
          subjectDescription: form.subjectDescription.trim() || null,
          details: form.details.trim(),
          instructions: form.instructions.trim(),
          lastSeenPlace: form.lastSeenPlace.trim() || null,
          lastSeenAt: form.lastSeenAt ? new Date(form.lastSeenAt).toISOString() : null,
          lat: form.lat === '' ? null : Number(form.lat),
          lng: form.lng === '' ? null : Number(form.lng),
          targetSectors: target,
          validHours: Number(form.validHours),
          incidentId: form.incidentId.trim() || null,
          declaration: true,
        },
        files,
      );
      showToast(t('alerts.form.sent', { ref: created.reference, n: created.counts.recipients }), 'success');
      navigate(`/alerts/${created.id}`, { replace: true });
    } catch (err) {
      setSending(false);
      setConfirming(false);
      showToast(errorMessage(err), 'error');
    }
  };

  const inputCls = (key) => cn('form-input', errors[key] && 'border-red-600');

  return (
    <form onSubmit={review} className="mx-auto max-w-4xl space-y-5" noValidate>
      <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900" role="note">
        <p className="flex items-center gap-2 font-semibold">
          <i className="fas fa-triangle-exclamation" aria-hidden="true" />
          {t('alerts.form.warningTitle')}
        </p>
        <p className="mt-1 leading-relaxed">{t('alerts.form.warningText')}</p>
      </div>

      <Card title={t('alerts.form.threat')} icon="fa-crosshairs" bodyClassName="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
        <Field label={t('alerts.form.title')} error={errors.title} required className="sm:col-span-2">
          <input value={form.title} onChange={set('title')} className={inputCls('title')} maxLength={200} placeholder={t('alerts.form.titlePh')} />
        </Field>
        <Field label={t('alerts.form.threatType')} required>
          <select value={form.threatType} onChange={set('threatType')} className="form-input">
            {opts.threatTypes.map((x) => (
              <option key={x} value={x}>
                {tv('alertThreat', x)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('alerts.form.priority')} hint={t(`alerts.form.priorityHint.${form.priority}`)} required>
          <div className="grid grid-cols-2 gap-2">
            {opts.priorities.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setForm((f) => ({ ...f, priority: p }))}
                aria-pressed={form.priority === p}
                className={cn('btn', form.priority === p ? (p === 'flash' ? 'btn-danger' : 'border-amber-500 bg-amber-50 text-amber-900') : 'btn-secondary')}
              >
                {tv('alertPriority', p)}
              </button>
            ))}
          </div>
        </Field>
      </Card>

      <Card title={t('alerts.form.subjectSection')} icon="fa-user-secret" bodyClassName="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
        <Field label={t('alerts.form.subjectName')} hint={t('alerts.form.subjectNameHint')}>
          <input value={form.subjectName} onChange={set('subjectName')} className="form-input" maxLength={200} />
        </Field>
        <Field label={t('alerts.form.linkedIncident')} hint={t('alerts.form.linkedIncidentHint')} error={errors.incidentId}>
          <input value={form.incidentId} onChange={set('incidentId')} className={cn(inputCls('incidentId'), 'font-mono')} placeholder="BIRDS-2026-1080" />
        </Field>
        <Field label={t('alerts.form.subjectDescription')} hint={t('alerts.form.subjectDescriptionHint')} className="sm:col-span-2">
          <textarea value={form.subjectDescription} onChange={set('subjectDescription')} rows={3} className="form-input" maxLength={4000} />
        </Field>
      </Card>

      <Card title={t('alerts.form.intelSection')} icon="fa-file-shield" bodyClassName="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
        <Field label={t('alerts.intelligence')} hint={t('alerts.form.detailsHint')} error={errors.details} required className="sm:col-span-2">
          <textarea value={form.details} onChange={set('details')} rows={5} className={inputCls('details')} maxLength={10000} />
        </Field>
        <Field label={t('alerts.actionRequired')} hint={t('alerts.form.instructionsHint')} error={errors.instructions} required className="sm:col-span-2">
          <textarea value={form.instructions} onChange={set('instructions')} rows={3} className={inputCls('instructions')} maxLength={4000} />
        </Field>
        <Field label={t('alerts.form.lastSeenPlace')}>
          <input value={form.lastSeenPlace} onChange={set('lastSeenPlace')} className="form-input" maxLength={255} />
        </Field>
        <Field label={t('alerts.form.lastSeenAt')}>
          <input type="datetime-local" value={form.lastSeenAt} onChange={set('lastSeenAt')} className="form-input" />
        </Field>
        <Field label={t('alerts.form.lat')} error={errors.lat}>
          <input value={form.lat} onChange={set('lat')} inputMode="decimal" className={cn(inputCls('lat'), 'font-mono')} placeholder="20.8667" />
        </Field>
        <Field label={t('alerts.form.lng')} error={errors.lng}>
          <input value={form.lng} onChange={set('lng')} inputMode="decimal" className={cn(inputCls('lng'), 'font-mono')} placeholder="92.2667" />
        </Field>
      </Card>

      <Card title={t('alerts.form.areaSection')} icon="fa-map-location-dot" bodyClassName="space-y-4 p-5">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
          <input type="checkbox" checked={allUnits} onChange={(e) => setAllUnits(e.target.checked)} className="h-4 w-4" />
          {t('alerts.form.allUnits')}
        </label>
        {!allUnits && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {opts.sectors.map((s) => (
              <label key={s} className={cn('flex items-center gap-2 rounded-md border px-3 py-2 text-sm', sectors.includes(s) ? 'border-red-400 bg-red-50' : 'border-slate-200')}>
                <input type="checkbox" checked={sectors.includes(s)} onChange={() => toggleSector(s)} className="h-4 w-4" />
                {s}
              </label>
            ))}
          </div>
        )}
        {errors.area && <p className="text-xs font-medium text-red-700">{errors.area}</p>}
        <p className="text-sm text-slate-700">
          <i className="fas fa-users mr-2 text-slate-500" aria-hidden="true" />
          {areaChosen && reach ? t('alerts.form.reach', { n: reach.recipients }) : t('alerts.form.reachNone')}
          <span className="block text-xs text-slate-500">{t('alerts.form.reachHint')}</span>
        </p>
        <Field label={t('alerts.form.validity')} required className="max-w-xs">
          <select value={form.validHours} onChange={set('validHours')} className="form-input">
            {opts.validHours.map((h) => (
              <option key={h} value={h}>
                {h >= 48 && h % 24 === 0 ? t('alerts.form.days', { n: h / 24 }) : t('alerts.form.hours', { n: h })}
              </option>
            ))}
          </select>
        </Field>
      </Card>

      <Card title={t('alerts.form.evidenceSection')} icon="fa-paperclip" bodyClassName="space-y-3 p-5">
        <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-secondary" disabled={files.length >= MAX_FILES}>
          <i className="fas fa-upload" aria-hidden="true" />
          {t('alerts.form.addFiles')}
        </button>
        <input ref={fileRef} type="file" multiple className="hidden" accept={[...EVIDENCE_TYPES, ...EVIDENCE_EXTENSIONS].join(',')} onChange={pickFiles} />
        <p className="text-xs text-slate-500">{t('form.uploadTypes', { mb: MAX_FILE_MB })}</p>
        {files.length > 0 && (
          <ul className="space-y-2">
            {files.map((f, i) => {
              const fi = FILE_ICONS[fileKind(f.type)] || FILE_ICONS.file;
              return (
                <li key={`${f.name}-${i}`} className="flex items-center gap-3 rounded-md border border-slate-200 p-2">
                  <span className={`flex h-8 w-8 items-center justify-center rounded ${fi.cls}`}>
                    <i className={`fas ${fi.icon} text-xs`} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
                  <span className="text-xs text-slate-500">{formatFileSize(f.size)}</span>
                  <button type="button" onClick={() => setFiles((list) => list.filter((_, j) => j !== i))} className="btn btn-danger-outline btn-sm">
                    {t('common.remove')}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className={cn('rounded-md border-2 p-4', errors.declaration ? 'border-red-600 bg-red-50' : 'border-red-300 bg-white')}>
        <label className="flex items-start gap-3 text-sm text-slate-900">
          <input
            type="checkbox"
            checked={declared}
            onChange={(e) => {
              setDeclared(e.target.checked);
              if (errors.declaration) setErrors((x) => ({ ...x, declaration: false }));
            }}
            className="mt-0.5 h-5 w-5 shrink-0"
          />
          <span>
            <span className="font-semibold">{t('alerts.form.declarationTitle')}</span>
            <span className="mt-1 block leading-relaxed">{t('alerts.form.declarationText', { name: currentUser?.name })}</span>
          </span>
        </label>
        {errors.declaration && <p className="mt-2 text-xs font-medium text-red-700">{errors.declaration}</p>}
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-between">
        <Link to="/alerts" className="btn btn-ghost">
          {t('common.cancel')}
        </Link>
        <button type="submit" className="btn btn-danger">
          <i className="fas fa-triangle-exclamation" aria-hidden="true" />
          {t('alerts.form.review')}
        </button>
      </div>

      <Modal open={confirming} title={t('alerts.form.confirmTitle')} icon="fa-triangle-exclamation" onClose={() => !sending && setConfirming(false)} busy={sending}>
        <div className="space-y-3 text-sm text-slate-800">
          <p className="font-semibold text-slate-900">{form.title}</p>
          <p>{t('alerts.form.confirmText', { n: reach?.recipients ?? 0, area: allUnits ? t('alerts.allUnits') : sectors.join(', '), priority: tv('alertPriority', form.priority) })}</p>
          <p className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-900">{t('alerts.form.confirmWarning')}</p>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)} disabled={sending}>
              {t('common.cancel')}
            </button>
            <button type="button" className="btn btn-danger" onClick={send} disabled={sending}>
              {sending && <i className="fas fa-spinner fa-spin" aria-hidden="true" />}
              {t('alerts.form.send')}
            </button>
          </div>
        </div>
      </Modal>
    </form>
  );
}
