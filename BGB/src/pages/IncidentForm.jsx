import { useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import * as incidentsApi from '../api/incidents';
import { errorMessage } from '../api/client';
import useApi from '../hooks/useApi';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import { cn, FILE_ICONS, fileKind, formatDateTime, formatFileSize, todayISO } from '../utils/helpers';
import Card from '../components/ui/Card';
import EvidenceMedia, { LocalMedia, PREVIEW_TYPES } from '../components/incidents/EvidenceMedia';
import ReasonBanner from '../components/incidents/ReasonBanner';
import DuplicateWarning from '../components/incidents/DuplicateWarning';
import ErrorState from '../components/ui/ErrorState';
import Spinner from '../components/ui/Spinner';
import { useI18n } from '../i18n/I18nContext';

const GPS_PRESETS = [
  { label: 'BOP Teknaf', sector: 'Sector-7', battalion: '17 BGB', bop: 'BOP Teknaf', location: 'Teknaf Border Area', lat: 20.8743, lng: 92.2683 },
  { label: 'BOP Comilla', sector: 'Sector-7', battalion: '42 BGB', bop: 'BOP Comilla', location: 'Comilla Zero Line Outpost', lat: 23.4607, lng: 91.1809 },
  { label: 'BOP Benapole', sector: 'Sector-11', battalion: '8 BGB', bop: 'BOP Benapole', location: 'Benapole Checkpost Sector', lat: 23.8, lng: 88.75 },
  { label: 'BOP Rajshahi', sector: 'Sector-11', battalion: '21 BGB', bop: 'BOP Rajshahi', location: 'Padma Riverbed Sector', lat: 24.3636, lng: 88.6241 },
];

// The fields the API accepts (incidents.schema.ts); anything else is rejected
const FIELDS = ['title', 'category', 'subcategory', 'severity', 'date', 'time', 'location', 'sector', 'battalion', 'bop', 'lat', 'lng', 'description', 'personsInvolved', 'actionTaken', 'outcome'];

const nowHHMM = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());

const emptyForm = () => ({
  title: '',
  date: todayISO(),
  time: nowHHMM(),
  category: '',
  subcategory: '',
  severity: 'Medium',
  sector: '',
  battalion: '',
  bop: '',
  location: '',
  lat: '',
  lng: '',
  description: '',
  personsInvolved: '',
  actionTaken: '',
  outcome: '',
});

// The server stores a complete record even for drafts (title >= 3 chars, description >= 10 chars,
// classification and org unit required); submission additionally needs the sub-category and location.
const DRAFT_REQUIRED = ['title', 'date', 'time', 'category', 'severity', 'sector', 'battalion', 'bop', 'description'];
const SUBMIT_REQUIRED = [...DRAFT_REQUIRED, 'subcategory', 'location'];
const MIN_LENGTH = { title: 3, description: 10 };
const STEP_OF = { title: 1, date: 1, time: 1, category: 1, subcategory: 1, severity: 1, sector: 2, battalion: 2, bop: 2, location: 2, lat: 2, lng: 2 };

// Mirrors the server's upload rules (evidence.router.ts); the server checks file content and is authoritative
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'video/mp4', 'video/quicktime'];
const MAX_FILE_MB = 50;
const MAX_FILES_PER_UPLOAD = 10;

function Field({ label, required, error, children, className = '' }) {
  const { t } = useI18n();
  return (
    <div className={className}>
      <label className="form-label text-xs font-bold text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs font-bold text-red-600">{error === true ? t('common.required') : error}</p>}
    </div>
  );
}

function toPayload(form) {
  const out = {};
  for (const k of FIELDS) {
    const v = form[k];
    if (k === 'lat' || k === 'lng') out[k] = v === '' || v === null || v === undefined ? null : Number(v);
    else out[k] = typeof v === 'string' ? v.trim() : v;
  }
  return out;
}

export default function IncidentForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { t } = useI18n();
  const { data: existing, error: loadError, message: loadMessage, reload } = useApi((signal) => incidentsApi.get(id, signal), [id], { enabled: Boolean(id) });

  if (id) {
    if (loadError) {
      return (
        <Card>
          <ErrorState message={loadError.status === 404 ? t('form.notFound', { id }) : loadMessage} onRetry={loadError.status === 404 ? undefined : reload} />
        </Card>
      );
    }
    if (!existing) return <Spinner />;
    // Spec #25 — only the creator may edit, and only while Draft/Returned (server decides)
    if (!existing.canEdit) return <Navigate to={`/incidents/${id}`} replace />;
  }
  return <IncidentFormBody key={existing?.id || 'new'} existing={existing} initialStep={Number(params.get('step')) || 1} />;
}

function IncidentFormBody({ existing, initialStep }) {
  const { meta } = useApp();
  const { showToast } = useToast();
  const { t, tv } = useI18n();
  const navigate = useNavigate();
  const fileRef = useRef(null);

  const [form, setForm] = useState(() => {
    const base = emptyForm();
    if (existing) for (const k of FIELDS) base[k] = existing[k] ?? '';
    return base;
  });
  const [errors, setErrors] = useState({});
  const [activeStep, setActiveStep] = useState(Math.min(3, Math.max(1, initialStep)));
  const [files, setFiles] = useState([]); // File objects waiting to be uploaded
  const [savedEvidence, setSavedEvidence] = useState(existing?.evidence || []);
  const [saving, setSaving] = useState(null); // 'Draft' | 'Submitted'

  // Warn before typed input or picked files are lost (not while a save is running)
  const [loadedForm] = useState(() => JSON.stringify(form));
  const unsavedDialog = useUnsavedChanges(!saving && (files.length > 0 || JSON.stringify(form) !== loadedForm));

  // Reference data from /incidents/meta: active categories and the org units within the user's scope
  const hierarchy = useMemo(() => meta?.hierarchy || {}, [meta]);
  const sectors = Object.keys(hierarchy);
  const battalions = useMemo(() => Object.keys(hierarchy[form.sector] || {}), [hierarchy, form.sector]);
  const bops = hierarchy[form.sector]?.[form.battalion]?.BOPs || [];
  const categories = meta?.categories || [];
  const subcategories = categories.find((c) => c.name === form.category)?.subcategories || [];
  const severities = meta?.severities || ['Low', 'Medium', 'High', 'Critical'];
  const presets = GPS_PRESETS.filter((p) => hierarchy[p.sector]?.[p.battalion]?.BOPs?.includes(p.bop));

  if (!meta) return <Spinner />;

  const update = (key, value) => {
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (key === 'category') next.subcategory = '';
      if (key === 'sector') {
        next.battalion = '';
        next.bop = '';
      }
      if (key === 'battalion') next.bop = '';
      return next;
    });
    if (errors[key]) setErrors((e) => ({ ...e, [key]: false }));
  };

  const bind = (key) => ({ id: `inc-${key}`, value: form[key], onChange: (e) => update(key, e.target.value) });
  const inputCls = (key) =>
    cn(
      'form-input text-xs font-semibold focus:ring-2 focus:ring-bgb-600/20',
      errors[key] && 'border-red-500 bg-red-50/50 focus:border-red-500 focus:ring-red-500/20',
    );

  const applyPreset = (preset) => {
    setForm((f) => ({
      ...f,
      sector: preset.sector,
      battalion: preset.battalion,
      bop: preset.bop,
      location: preset.location,
      lat: preset.lat,
      lng: preset.lng,
    }));
    showToast(t('form.presetLoaded', { label: preset.label }), 'info');
  };

  // Spec #8 — device GPS only; never invent coordinates for an evidential record
  const handleDetectGPS = () => {
    if (!('geolocation' in navigator)) {
      showToast(t('form.gpsUnavailable'), 'error');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        update('lat', pos.coords.latitude.toFixed(6));
        update('lng', pos.coords.longitude.toFixed(6));
        showToast(t('form.gpsOk'), 'success');
      },
      () => showToast(t('form.gpsFailed'), 'error'),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const handleFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    const ok = [];
    for (const f of picked) {
      if (!ALLOWED_TYPES.includes(f.type)) showToast(t('form.badType', { name: f.name }), 'error');
      else if (f.size > MAX_FILE_MB * 1024 * 1024) showToast(t('form.tooBig', { name: f.name, mb: MAX_FILE_MB }), 'error');
      else ok.push(f);
    }
    if (!ok.length) return;
    setFiles((list) => [...list, ...ok]);
    showToast(t('form.attached', { n: ok.length }), 'success');
  };

  const removeFile = (idx) => setFiles((list) => list.filter((_, i) => i !== idx));

  const removeSaved = async (ev) => {
    try {
      await incidentsApi.removeEvidence(existing.id, ev.id);
      setSavedEvidence((list) => list.filter((x) => x.id !== ev.id));
      showToast(t('detail.removed', { name: ev.name }), 'success');
    } catch (err) {
      showToast(errorMessage(err), 'error');
    }
  };

  const validate = (status) => {
    const required = status === 'Draft' ? DRAFT_REQUIRED : SUBMIT_REQUIRED;
    const found = {};
    for (const k of required) if (!String(form[k] ?? '').trim()) found[k] = true;
    for (const [k, min] of Object.entries(MIN_LENGTH)) {
      if (!found[k] && String(form[k]).trim().length < min) found[k] = t('common.minChars', { min });
    }
    if (form.date && form.date > todayISO()) found.date = t('form.futureDate');
    const lat = form.lat === '' ? null : Number(form.lat);
    const lng = form.lng === '' ? null : Number(form.lng);
    if (lat !== null && !(lat >= -90 && lat <= 90)) found.lat = t('form.latRange');
    if (lng !== null && !(lng >= -180 && lng <= 180)) found.lng = t('form.lngRange');
    if ((lat === null) !== (lng === null)) found[lat === null ? 'lat' : 'lng'] = t('form.bothCoords');
    return found;
  };

  const showErrors = (found) => {
    setErrors(found);
    showToast(t('form.completeFields'), 'error');
    const first = Object.keys(found)[0];
    setActiveStep(STEP_OF[first] || 3);
    setTimeout(() => document.getElementById(`inc-${first}`)?.focus(), 100);
  };

  // Field errors returned by the API (Zod details) map back onto the form
  const applyServerErrors = (err) => {
    const fieldErrors = err?.details?.fieldErrors || {};
    const found = {};
    for (const [key, msgs] of Object.entries(fieldErrors)) {
      if (FIELDS.includes(key)) found[key] = (Array.isArray(msgs) && msgs[0]) || true;
    }
    if (Object.keys(found).length) showErrors(found);
  };

  // Batches are all-or-nothing on the server; drop each stored batch so a retry doesn't duplicate it
  const uploadPending = async (incidentId) => {
    let done = 0;
    try {
      for (; done < files.length; done += MAX_FILES_PER_UPLOAD) {
        await incidentsApi.uploadEvidence(incidentId, files.slice(done, done + MAX_FILES_PER_UPLOAD));
      }
    } finally {
      setFiles(files.slice(done));
    }
  };

  const save = async (status) => {
    const found = validate(status);
    if (Object.keys(found).length) return showErrors(found);

    setSaving(status);
    const payload = toPayload(form);
    let incidentId = existing?.id;
    try {
      // 1. Save. With files to attach it stays a Draft for now: evidence can only be added while Draft/Returned.
      if (existing) await incidentsApi.update(existing.id, payload);
      else incidentId = (await incidentsApi.create(payload, files.length ? 'Draft' : status)).id;
    } catch (err) {
      setSaving(null);
      showToast(errorMessage(err), 'error');
      applyServerErrors(err);
      return;
    }

    // 2. Upload evidence. The record is already saved, so on failure stay in the editor.
    try {
      await uploadPending(incidentId);
    } catch (err) {
      setSaving(null);
      showToast(t('form.uploadFailed', { id: incidentId, error: errorMessage(err) }), 'error');
      setActiveStep(3);
      // A new incident now exists as a draft; continue in its editor so a retry doesn't create a duplicate
      if (!existing) navigate(`/incidents/${incidentId}/edit?step=3`, { replace: true });
      return;
    }

    // 3. Submit for review
    try {
      if (status === 'Submitted' && (existing || files.length)) await incidentsApi.submit(incidentId);
    } catch (err) {
      setSaving(null);
      showToast(t('form.submitFailed', { id: incidentId, error: errorMessage(err) }), 'error');
      navigate(`/incidents/${incidentId}`);
      return;
    }

    setSaving(null);
    showToast(t(status === 'Draft' ? 'form.savedDraft' : 'form.submitted', { id: incidentId }), 'success');
    navigate(`/incidents/${incidentId}`);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* A returned report: what the reviewer asked to change */}
      {existing && <ReasonBanner incident={existing} />}

      {/* Step Progress Header Bar */}
      <div className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg sm:text-xl font-black text-gray-900 tracking-tight">
              {existing ? t('form.editTitle', { id: existing.id }) : t('form.newTitle')}
            </h2>
            <p className="text-xs text-gray-500 font-medium">
              {t('form.subtitle')}
            </p>
          </div>
          <div className="hidden sm:block text-right">
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
              <i className="fas fa-shield-alt mr-1" /> {t('form.badge')}
            </span>
          </div>
        </div>

        {/* Step Tabs Indicator */}
        <div className="grid grid-cols-3 gap-2 border-t border-gray-100 pt-3 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveStep(1)}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 transition-all ${
              activeStep === 1
                ? 'bg-bgb-600 text-white shadow-md'
                : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
            }`}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[10px]">1</span>
            <span className="truncate">{t('form.step1')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveStep(2)}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 transition-all ${
              activeStep === 2
                ? 'bg-bgb-600 text-white shadow-md'
                : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
            }`}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[10px]">2</span>
            <span className="truncate">{t('form.step2')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveStep(3)}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 transition-all ${
              activeStep === 3
                ? 'bg-bgb-600 text-white shadow-md'
                : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
            }`}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[10px]">3</span>
            <span className="truncate">{t('form.step3')}</span>
          </button>
        </div>
      </div>

      {/* Main Form Body */}
      <Card bodyClassName="p-5 sm:p-7">
        <form
          id="incident-form"
          onSubmit={(e) => {
            e.preventDefault();
            save('Submitted');
          }}
          className="space-y-6"
          noValidate
        >
          {/* Same place, around the same time: possibly already reported (advisory) */}
          {activeStep >= 2 && <DuplicateWarning form={form} excludeId={existing?.id} />}

          {/* STEP 1: Basic Information & Threat Classification */}
          {activeStep === 1 && (
            <div className="space-y-5 animate-fade-in">
              <div className="border-b border-gray-100 pb-3">
                <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
                  <i className="fas fa-tags text-bgb-600" /> {t('form.basicTitle')}
                </h3>
                <p className="text-xs text-gray-500 font-medium">{t('form.basicHint')}</p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={t('form.titleLabel')} required error={errors.title} className="sm:col-span-2">
                  <input
                    {...bind('title')}
                    className={inputCls('title')}
                    placeholder={t('form.titlePh')}
                  />
                </Field>

                <Field label={t('common.date')} required error={errors.date}>
                  <input type="date" max={todayISO()} {...bind('date')} className={inputCls('date')} />
                </Field>

                <Field label={t('form.time24')} required error={errors.time}>
                  <input type="time" {...bind('time')} className={inputCls('time')} />
                </Field>
              </div>

              {/* Threat Severity Selector Pills */}
              <div>
                <label className="form-label text-xs font-bold text-gray-700 mb-1.5 block">
                  {t('form.severityLabel')} <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {severities.map((sev) => {
                    const selected = form.severity === sev;
                    const styles = {
                      Low: 'border-green-300 bg-green-50 text-green-800 hover:bg-green-100',
                      Medium: 'border-yellow-300 bg-yellow-50 text-yellow-800 hover:bg-yellow-100',
                      High: 'border-orange-300 bg-orange-50 text-orange-800 hover:bg-orange-100',
                      Critical: 'border-red-300 bg-red-50 text-red-800 hover:bg-red-100',
                    };
                    const selectedStyles = {
                      Low: 'bg-green-600 text-white ring-2 ring-green-600/30 border-green-600',
                      Medium: 'bg-yellow-500 text-white ring-2 ring-yellow-500/30 border-yellow-500',
                      High: 'bg-orange-600 text-white ring-2 ring-orange-600/30 border-orange-600',
                      Critical: 'bg-red-600 text-white ring-2 ring-red-600/30 border-red-600',
                    };
                    return (
                      <button
                        key={sev}
                        type="button"
                        onClick={() => update('severity', sev)}
                        className={`rounded-xl border p-3 text-center text-xs font-extrabold transition-all shadow-sm ${
                          selected ? selectedStyles[sev] : styles[sev]
                        }`}
                      >
                        {t('form.threat', { sev: tv('severity', sev) })}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-2">
                <Field label={t('common.category')} required error={errors.category}>
                  <select {...bind('category')} className={inputCls('category')}>
                    <option value="">{t('form.selectCategory')}</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label={t('common.subcategory')} required error={errors.subcategory}>
                  <select
                    {...bind('subcategory')}
                    className={inputCls('subcategory')}
                    disabled={!subcategories.length}
                  >
                    <option value="">{t('form.selectSubcategory')}</option>
                    {subcategories.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="flex justify-end pt-4">
                <button
                  type="button"
                  onClick={() => setActiveStep(2)}
                  className="btn btn-primary py-2.5 px-5 text-xs font-bold shadow-md"
                >
                  {t('form.toLocation')} <i className="fas fa-arrow-right ml-1" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Location & Spatial GPS Coordinates */}
          {activeStep === 2 && (
            <div className="space-y-5 animate-fade-in">
              <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
                    <i className="fas fa-map-marked-alt text-bgb-600" /> {t('form.locTitle')}
                  </h3>
                  <p className="text-xs text-gray-500 font-medium">{t('form.locHint')}</p>
                </div>
                <button
                  type="button"
                  onClick={handleDetectGPS}
                  className="btn bg-bgb-50 text-bgb-800 hover:bg-bgb-100 text-xs font-bold border border-bgb-200"
                >
                  <i className="fas fa-crosshairs text-bgb-600 mr-1" /> {t('form.detectGps')}
                </button>
              </div>

              {/* Quick Preset Buttons */}
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">
                  {t('form.presets')}
                </label>
                <div className="flex flex-wrap gap-2">
                  {presets.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-bgb-50 hover:text-bgb-800 border border-gray-200 transition-all"
                    >
                      <i className="fas fa-map-marker-alt text-bgb-600 mr-1" /> {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label={t('common.sector')} required error={errors.sector}>
                  <select {...bind('sector')} className={inputCls('sector')}>
                    <option value="">{t('form.selectSector')}</option>
                    {sectors.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label={t('common.battalion')} required error={errors.battalion}>
                  <select
                    {...bind('battalion')}
                    className={inputCls('battalion')}
                    disabled={!battalions.length}
                  >
                    <option value="">{t('form.selectBattalion')}</option>
                    {battalions.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label={t('form.bopLabel')} required error={errors.bop}>
                  <select {...bind('bop')} className={inputCls('bop')} disabled={!bops.length}>
                    <option value="">{t('form.selectBop')}</option>
                    {bops.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label={t('form.locationLabel')} required error={errors.location} className="sm:col-span-1">
                  <input
                    {...bind('location')}
                    className={inputCls('location')}
                    placeholder={t('form.locationPh')}
                  />
                </Field>

                <Field label={t('form.lat')} error={errors.lat}>
                  <input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    {...bind('lat')}
                    className="form-input text-xs font-mono font-bold"
                    placeholder="e.g. 23.4607"
                  />
                </Field>

                <Field label={t('form.lng')} error={errors.lng}>
                  <input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    {...bind('lng')}
                    className="form-input text-xs font-mono font-bold"
                    placeholder="e.g. 91.1809"
                  />
                </Field>
              </div>

              <div className="flex justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setActiveStep(1)}
                  className="btn btn-ghost py-2.5 px-4 text-xs font-semibold"
                >
                  <i className="fas fa-arrow-left mr-1" /> {t('common.back')}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveStep(3)}
                  className="btn btn-primary py-2.5 px-5 text-xs font-bold shadow-md"
                >
                  {t('form.toDetails')} <i className="fas fa-arrow-right ml-1" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Operational Details & Evidence */}
          {activeStep === 3 && (
            <div className="space-y-5 animate-fade-in">
              <div className="border-b border-gray-100 pb-3">
                <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
                  <i className="fas fa-align-left text-bgb-600" /> {t('form.detailsTitle')}
                </h3>
                <p className="text-xs text-gray-500 font-medium">{t('form.detailsHint')}</p>
              </div>

              <Field label={t('form.narrative')} required error={errors.description}>
                <textarea
                  {...bind('description')}
                  rows={4}
                  className={inputCls('description')}
                  placeholder={t('form.narrativePh')}
                />
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label={t('detail.persons')}>
                  <input {...bind('personsInvolved')} className="form-input text-xs" placeholder={t('form.personsPh')} />
                </Field>

                <Field label={t('detail.actionTaken')}>
                  <input {...bind('actionTaken')} className="form-input text-xs" placeholder={t('form.actionPh')} />
                </Field>

                <Field label={t('form.outcomeLabel')}>
                  <input {...bind('outcome')} className="form-input text-xs" placeholder={t('form.outcomePh')} />
                </Field>
              </div>

              {/* Evidence Upload Zone */}
              <div className="pt-2">
                <label className="form-label text-xs font-bold text-gray-700 mb-1.5 block">
                  {t('form.evidenceLabel')}
                </label>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="w-full rounded-2xl border-2 border-dashed border-gray-300 p-6 text-center transition-all hover:border-bgb-500 hover:bg-bgb-50/50"
                >
                  <i className="fas fa-cloud-upload-alt mb-2 text-3xl text-bgb-600" />
                  <p className="text-xs text-gray-700 font-bold">
                    <span className="text-bgb-700 underline">{t('form.uploadCta')}</span>
                  </p>
                  <p className="mt-1 text-[11px] text-gray-400 font-medium">{t('form.uploadTypes', { mb: MAX_FILE_MB })}</p>
                </button>
                <input ref={fileRef} type="file" className="hidden" multiple accept={ALLOWED_TYPES.join(',')} onChange={handleFiles} />

                {(savedEvidence.length > 0 || files.length > 0) && (
                  <ul className="mt-3 space-y-2">
                    {savedEvidence.map((ev) => {
                      const fi = FILE_ICONS[fileKind(ev.mimeType)] || FILE_ICONS.file;
                      return (
                        <li key={`saved-${ev.id}`} className="rounded-xl bg-emerald-50/50 p-2.5 border border-emerald-200">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${fi.cls}`}>
                                <i className={`fas ${fi.icon} text-xs`} />
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-xs font-bold text-gray-800">{ev.name}</p>
                                <p className="text-[10px] text-gray-500 font-mono">
                                  {formatFileSize(ev.size)} &bull; {t('form.uploadedAt', { date: formatDateTime(ev.uploadedAt) })}
                                </p>
                              </div>
                            </div>
                            <button type="button" onClick={() => removeSaved(ev)} className="btn btn-ghost p-1 text-red-500 hover:text-red-700" title={t('form.removeFile')} aria-label={t('detail.removeAria', { name: ev.name })}>
                              <i className="fas fa-trash-alt text-xs" />
                            </button>
                          </div>
                          {ev.available && PREVIEW_TYPES.has(ev.mimeType) && <EvidenceMedia incidentId={existing.id} evidence={ev} size="small" />}
                        </li>
                      );
                    })}
                    {files.map((f, idx) => {
                      const fi = FILE_ICONS[fileKind(f.type)] || FILE_ICONS.file;
                      return (
                        <li key={`${f.name}-${idx}`} className="rounded-xl bg-gray-50 p-2.5 border border-gray-200">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${fi.cls}`}>
                                <i className={`fas ${fi.icon} text-xs`} />
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-xs font-bold text-gray-800">{f.name}</p>
                                <p className="text-[10px] text-gray-500 font-mono">{formatFileSize(f.size)} &bull; {t('form.uploadsOnSave')}</p>
                              </div>
                            </div>
                            <button type="button" onClick={() => removeFile(idx)} className="btn btn-ghost p-1 text-red-500 hover:text-red-700" title={t('form.removeFile')} aria-label={t('detail.removeAria', { name: f.name })}>
                              <i className="fas fa-times text-xs" />
                            </button>
                          </div>
                          {PREVIEW_TYPES.has(f.type) && <LocalMedia file={f} />}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="flex justify-between pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setActiveStep(2)}
                  className="btn btn-ghost py-2.5 px-4 text-xs font-semibold"
                >
                  <i className="fas fa-arrow-left mr-1" /> {t('common.back')}
                </button>
              </div>
            </div>
          )}

          {/* Form Action Controls (Always visible at bottom) */}
          <div className="flex flex-col-reverse gap-2 border-t-2 border-gray-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <Link
              to={existing ? `/incidents/${existing.id}` : '/incidents'}
              className="btn btn-ghost text-xs font-semibold text-gray-600"
            >
              {t('common.cancel')}
            </Link>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => save('Draft')}
                disabled={Boolean(saving)}
                className="btn bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 py-2.5 px-4 text-xs font-bold"
              >
                <i className={`fas ${saving === 'Draft' ? 'fa-spinner fa-spin' : 'fa-save'} mr-1`} /> {t('form.saveDraft')}
              </button>
              <button
                type="submit"
                disabled={Boolean(saving)}
                className="btn btn-primary py-2.5 px-6 text-xs font-extrabold shadow-lg bg-gradient-to-r from-bgb-700 to-bgb-600 hover:from-bgb-800 hover:to-bgb-700"
              >
                <i className={`fas ${saving === 'Submitted' ? 'fa-spinner fa-spin' : 'fa-paper-plane'} mr-1.5`} />{' '}
                {existing?.status === 'Returned' ? t('form.resubmit') : t('form.submit')}
              </button>
            </div>
          </div>
        </form>
      </Card>
      {unsavedDialog}
    </div>
  );
}
