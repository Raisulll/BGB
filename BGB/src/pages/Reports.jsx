import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import * as reportsApi from '../api/reports';
import { errorMessage } from '../api/client';
import useApi from '../hooks/useApi';
import Card from '../components/ui/Card';
import OfficialReport from '../components/reports/OfficialReport';
import PrintPreview from '../components/reports/PrintPreview';
import ReportOverview from '../components/reports/ReportOverview';
import useEvidencePreviews from '../hooks/useEvidencePreviews';
import ErrorState from '../components/ui/ErrorState';
import Spinner from '../components/ui/Spinner';
import { useI18n } from '../i18n/I18nContext';

// Specs #21, #22 — configurable reports built by the server (scope, drafts excluded, report type
// rules) and exported by the server with the classification banner; every export is audited.
const EMPTY = { dateFrom: '', dateTo: '', sector: '', battalion: '', category: '', severity: '', status: '' };

export default function Reports() {
  const { meta } = useApp();
  const { showToast } = useToast();
  const { t, tv } = useI18n();

  const [reportType, setReportType] = useState('operational');
  const [form, setForm] = useState(EMPTY);
  const [applied, setApplied] = useState({ type: 'operational', ...EMPTY });
  const [withDetails, setWithDetails] = useState(false); // incident annex: one full record per incident
  const [appliedDetails, setAppliedDetails] = useState(false);
  const [exporting, setExporting] = useState(null);
  const [printing, setPrinting] = useState(false);
  const [printed, setPrinted] = useState(null); // { reference, printedAt, for: the filters it was issued for }
  const [previewOpen, setPreviewOpen] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value, ...(key === 'sector' ? { battalion: '' } : {}) }));
  const { data: report, error, message, reload, loading } = useApi(() => reportsApi.operational(applied), [applied]);
  // The incident annex (and its evidence previews) is only needed for printing: loaded while the preview is open
  const wantAnnex = previewOpen && appliedDetails;
  const annexState = useApi(() => (wantAnnex ? reportsApi.details(applied) : Promise.resolve(null)), [applied, wantAnnex]);
  const annex = wantAnnex ? annexState.data : null;
  const { previews, total: previewTotal, pending: previewPending } = useEvidencePreviews(annex?.incidents);
  const annexLoading = wantAnnex && !annex && !annexState.error;
  const preparing = annexLoading || previewPending > 0;

  const hierarchy = meta?.hierarchy || {};
  const battalions = form.sector ? Object.keys(hierarchy[form.sector] || {}) : Object.values(hierarchy).flatMap((b) => Object.keys(b));

  const handleGenerate = () => {
    if (form.dateFrom && form.dateTo && form.dateFrom > form.dateTo) {
      showToast(t('rep.dateOrder'), 'error');
      return;
    }
    setApplied({ type: reportType, ...form });
    setAppliedDetails(withDetails);
  };

  const handleResetFilters = () => {
    setForm(EMPTY);
    setApplied({ type: reportType, ...EMPTY });
    setWithDetails(false);
    setAppliedDetails(false);
    showToast(t('rep.reset'), 'info');
  };

  const doExport = async (format) => {
    setExporting(format);
    try {
      const name = await reportsApi.exportReport(format, applied);
      showToast(t('common.downloaded', { name }), 'success');
    } catch (err) {
      showToast(errorMessage(err), 'error');
    } finally {
      setExporting(null);
    }
  };

  // The server issues the reference number and audits the print first; no audit entry, no print
  const handlePrint = async () => {
    setPrinting(true);
    try {
      const { reference, printedAt } = await reportsApi.recordPrint({ ...applied, details: appliedDetails ? 1 : 0 });
      setPrinted({ reference, printedAt, for: applied });
      setTimeout(() => window.print(), 50); // let the reference number render first
    } catch (err) {
      showToast(errorMessage(err), 'error');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Parameter Controls Panel */}
      <Card title={t('rep.console')} icon="fa-sliders-h" className="print:hidden">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="form-label">{t('rep.template')}</label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                className="form-input"
              >
                {['operational', 'statistical', 'high-threat', 'sector-audit'].map((type) => (
                  <option key={type} value={type}>
                    {t(`rep.type.${type}`)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label">{t('rep.dateFrom')}</label>
              <input
                type="date"
                value={form.dateFrom}
                onChange={set('dateFrom')}
                className="form-input"
              />
            </div>

            <div>
              <label className="form-label">{t('rep.dateTo')}</label>
              <input
                type="date"
                value={form.dateTo}
                onChange={set('dateTo')}
                className="form-input"
              />
            </div>

            <div>
              <label className="form-label">{t('rep.sectorBattalion')}</label>
              <div className="grid grid-cols-2 gap-2">
                <select value={form.sector} onChange={set('sector')} className="form-input" aria-label={t('common.sector')}>
                  <option value="">{t('common.allSectors')}</option>
                  {Object.keys(hierarchy).map((sec) => (
                    <option key={sec}>{sec}</option>
                  ))}
                </select>
                <select value={form.battalion} onChange={set('battalion')} className="form-input" aria-label={t('common.battalion')}>
                  <option value="">{t('common.allBattalions')}</option>
                  {battalions.map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-4 pt-2 border-t border-gray-100">
            <div>
              <label className="form-label">{t('rep.category')}</label>
              <select
                value={form.category}
                onChange={set('category')}
                className="form-input"
              >
                <option value="">{t('common.allCategories')}</option>
                {(meta?.categories || []).map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label">{t('rep.severity')}</label>
              <select
                value={form.severity}
                onChange={set('severity')}
                className="form-input"
              >
                <option value="">{t('rep.allSeverities')}</option>
                {(meta?.severities || []).map((s) => (
                  <option key={s} value={s}>
                    {tv('severity', s)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label">{t('rep.status')}</label>
              <select
                value={form.status}
                onChange={set('status')}
                className="form-input"
              >
                <option value="">{t('rep.allStatuses')}</option>
                {(meta?.statuses || []).filter((st) => st !== 'Draft').map((s) => (
                  <option key={s} value={s}>
                    {tv('status', s)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={loading}
                className="btn btn-primary flex-1"
              >
                {loading && <i className="fas fa-spinner fa-spin" aria-hidden="true" />}
                {t('rep.update')}
              </button>
              <button
                type="button"
                onClick={handleResetFilters}
                className="btn btn-secondary"
                title={t('rep.resetTitle')}
              >
                {t('rep.resetBtn')}
              </button>
            </div>
          </div>

          {/* Annex A: every incident in the report on its own page, with evidence previews */}
          <label className="flex cursor-pointer items-start gap-3 border-t border-gray-100 pt-3">
            <input
              type="checkbox"
              checked={withDetails}
              onChange={(e) => {
                setWithDetails(e.target.checked);
                setAppliedDetails(e.target.checked);
              }}
              className="mt-0.5 h-4 w-4 shrink-0 accent-bgb-700"
            />
            <span>
              <span className="block text-sm font-medium text-slate-800">{t('rep.detailsOption')}</span>
              <span className="block text-sm text-slate-600">{t('rep.detailsHint')}</span>
            </span>
          </label>
        </div>
      </Card>

      {/* Generated report: in-app overview on screen; Print / PDF opens the formal document as a preview */}
      {error ? (
        <Card>
          <ErrorState message={message} onRetry={reload} />
        </Card>
      ) : !report ? (
        <Spinner />
      ) : (
        <div className={`space-y-4 ${previewOpen ? 'print:hidden' : ''}`}>
          <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
            <p className="text-sm text-slate-600">
              {t(`rep.type.${report.meta.type}`)} · {t('rep.filedN', { n: report.summary.total })}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setPreviewOpen(true)} className="btn btn-secondary">
                {t('rep.print')}
              </button>
              <button type="button" onClick={() => doExport('excel')} disabled={Boolean(exporting)} className="btn btn-secondary">
                {exporting === 'excel' && <i className="fas fa-spinner fa-spin" aria-hidden="true" />}
                {t('rep.excel')}
              </button>
              <button type="button" onClick={() => doExport('csv')} disabled={Boolean(exporting)} className="btn btn-secondary">
                {exporting === 'csv' && <i className="fas fa-spinner fa-spin" aria-hidden="true" />}
                {t('rep.csv')}
              </button>
            </div>
          </div>
          <div className="print:hidden">
            <ReportOverview report={report} />
          </div>
          {/* Ctrl+P on the overview: printing goes through the preview (reference number + audit entry) */}
          <p className="hidden text-sm print:block">{t('rep.printUse')}</p>
        </div>
      )}

      {previewOpen && report && (
        <PrintPreview
          onClose={() => setPreviewOpen(false)}
          onPrint={handlePrint}
          printing={printing}
          preparing={preparing}
          status={
            !appliedDetails
              ? null
              : annexState.error
                ? t('rep.detailsFailed', { reason: annexState.message })
                : annexLoading
                  ? t('rep.loadingDetails')
                  : previewPending > 0
                    ? t('rep.preparingEvidence', { n: previewTotal - previewPending, total: previewTotal })
                    : annex?.truncated
                      ? t('rep.detailsLimited', { n: annex.incidents.length, total: annex.total })
                      : null
          }
        >
          <OfficialReport report={report} printed={printed?.for === applied ? printed : null} annex={annex} previews={previews} />
        </PrintPreview>
      )}
    </div>
  );
}
