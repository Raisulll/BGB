import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import * as reportsApi from '../api/reports';
import { errorMessage } from '../api/client';
import useApi from '../hooks/useApi';
import { formatDateDisplay, formatDateTime } from '../utils/helpers';
import { SeverityBadge, StatusBadge } from '../components/ui/Badges';
import Card from '../components/ui/Card';
import ErrorState from '../components/ui/ErrorState';
import Spinner from '../components/ui/Spinner';

// Specs #21, #22 — configurable reports built by the server (scope, drafts excluded, report type
// rules) and exported by the server with the classification banner; every export is audited.
const EMPTY = { dateFrom: '', dateTo: '', sector: '', battalion: '', category: '', severity: '', status: '' };

export default function Reports() {
  const { meta } = useApp();
  const { showToast } = useToast();

  const [reportType, setReportType] = useState('operational');
  const [form, setForm] = useState(EMPTY);
  const [applied, setApplied] = useState({ type: 'operational', ...EMPTY });
  const [exporting, setExporting] = useState(null);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value, ...(key === 'sector' ? { battalion: '' } : {}) }));
  const { data: report, error, message, reload, loading } = useApi(() => reportsApi.operational(applied), [applied]);

  const hierarchy = meta?.hierarchy || {};
  const battalions = form.sector ? Object.keys(hierarchy[form.sector] || {}) : Object.values(hierarchy).flatMap((b) => Object.keys(b));

  const handleGenerate = () => {
    if (form.dateFrom && form.dateTo && form.dateFrom > form.dateTo) {
      showToast('"Date From" must not be after "Date To"', 'error');
      return;
    }
    setApplied({ type: reportType, ...form });
  };

  const handleResetFilters = () => {
    setForm(EMPTY);
    setApplied({ type: reportType, ...EMPTY });
    showToast('Report parameters reset to default', 'info');
  };

  const doExport = async (format) => {
    setExporting(format);
    try {
      const name = await reportsApi.exportReport(format, applied);
      showToast(`Downloaded ${name}`, 'success');
    } catch (err) {
      showToast(errorMessage(err), 'error');
    } finally {
      setExporting(null);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const derived = useMemo(() => {
    if (!report) return null;
    const s = report.summary;
    return {
      total: s.total,
      critical: (s.bySeverity.High || 0) + (s.bySeverity.Critical || 0),
      pending: s.pendingReview + s.returned,
      resolved: s.approved + s.closed,
      byCategory: report.byCategory.filter((c) => c.count > 0),
      bySector: report.bySector,
    };
  }, [report]);

  return (
    <div className="space-y-6">
      {/* Parameter Controls Panel */}
      <Card title="Report Configuration Console" icon="fa-sliders-h" className="print:hidden">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="form-label text-xs font-bold text-gray-700 mb-1">Report Template</label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                className="form-input text-xs font-semibold"
              >
                <option value="operational">Operational Log Report</option>
                <option value="statistical">Statistical &amp; Threat Summary</option>
                <option value="high-threat">High-Threat Alert Digest</option>
                <option value="sector-audit">Sector Performance Report</option>
              </select>
            </div>

            <div>
              <label className="form-label text-xs font-bold text-gray-700 mb-1">Date From</label>
              <input
                type="date"
                value={form.dateFrom}
                onChange={set('dateFrom')}
                className="form-input text-xs font-semibold"
              />
            </div>

            <div>
              <label className="form-label text-xs font-bold text-gray-700 mb-1">Date To</label>
              <input
                type="date"
                value={form.dateTo}
                onChange={set('dateTo')}
                className="form-input text-xs font-semibold"
              />
            </div>

            <div>
              <label className="form-label text-xs font-bold text-gray-700 mb-1">Sector / Battalion</label>
              <div className="grid grid-cols-2 gap-2">
                <select value={form.sector} onChange={set('sector')} className="form-input text-xs font-semibold" aria-label="Sector">
                  <option value="">All Sectors</option>
                  {Object.keys(hierarchy).map((sec) => (
                    <option key={sec}>{sec}</option>
                  ))}
                </select>
                <select value={form.battalion} onChange={set('battalion')} className="form-input text-xs font-semibold" aria-label="Battalion">
                  <option value="">All Battalions</option>
                  {battalions.map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-4 pt-2 border-t border-gray-100">
            <div>
              <label className="form-label text-xs font-bold text-gray-700 mb-1">Incident Category</label>
              <select
                value={form.category}
                onChange={set('category')}
                className="form-input text-xs font-semibold"
              >
                <option value="">All Categories</option>
                {(meta?.categories || []).map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label text-xs font-bold text-gray-700 mb-1">Threat Severity</label>
              <select
                value={form.severity}
                onChange={set('severity')}
                className="form-input text-xs font-semibold"
              >
                <option value="">All Severities</option>
                {(meta?.severities || []).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label text-xs font-bold text-gray-700 mb-1">Workflow Status</label>
              <select
                value={form.status}
                onChange={set('status')}
                className="form-input text-xs font-semibold"
              >
                <option value="">All Statuses</option>
                {(meta?.statuses || []).filter((st) => st !== 'Draft').map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={loading}
                className="btn btn-primary flex-1 py-2.5 text-xs font-bold shadow-md"
              >
                <i className={`fas fa-sync-alt mr-1 text-xs ${loading ? 'fa-spin' : ''}`} /> Update Report
              </button>
              <button
                type="button"
                onClick={handleResetFilters}
                className="btn btn-ghost px-3 py-2.5 text-xs font-semibold text-gray-600 hover:text-gray-900 border border-gray-200"
                title="Reset All Parameters"
              >
                <i className="fas fa-undo text-xs" />
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Generated Report Output Document */}
      <Card bodyClassName="p-6 sm:p-8">
        {error ? (
          <ErrorState message={message} onRetry={reload} />
        ) : !report ? (
          <Spinner />
        ) : (
          <div className="space-y-6">
            {/* Formal Report Header */}
            <div className="flex flex-col gap-4 border-b-2 border-bgb-700 pb-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-bgb-50 p-2 border border-bgb-200 shadow-sm">
                  <img src="/bgb.png" alt="BGB Crest" className="h-10 w-auto" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-red-100 px-2 py-0.5 text-[10px] font-extrabold text-red-800 uppercase tracking-widest border border-red-200">
                      CONFIDENTIAL // OPERATIONAL
                    </span>

                  </div>
                  <h2 className="mt-1 text-xl font-black text-bgb-900 sm:text-2xl uppercase tracking-tight">
                    Headquarters Border Guard Bangladesh
                  </h2>
                  <p className="text-xs font-bold text-bgb-700 tracking-wide">
                    {report.meta.title}
                  </p>
                </div>
              </div>

              {/* Action Toolbar */}
              <div className="flex flex-wrap items-center gap-2 print:hidden">
                <button
                  type="button"
                  onClick={handlePrint}
                  className="btn bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-3.5 text-xs shadow-sm"
                >
                  <i className="fas fa-file-pdf mr-1" /> PDF / Print
                </button>
                <button
                  type="button"
                  onClick={() => doExport('excel')}
                  disabled={Boolean(exporting)}
                  className="btn bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-2 px-3.5 text-xs shadow-sm"
                >
                  <i className={`fas ${exporting === 'excel' ? 'fa-spinner fa-spin' : 'fa-file-excel'} mr-1`} /> Export Excel
                </button>
                <button
                  type="button"
                  onClick={() => doExport('csv')}
                  disabled={Boolean(exporting)}
                  className="btn bg-blue-700 hover:bg-blue-800 text-white font-bold py-2 px-3.5 text-xs shadow-sm"
                >
                  <i className={`fas ${exporting === 'csv' ? 'fa-spinner fa-spin' : 'fa-file-csv'} mr-1`} /> CSV
                </button>
              </div>
            </div>

            {/* Document Metadata Bar */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 bg-gray-50 rounded-xl p-3.5 border border-gray-200 text-xs text-gray-700">
              <div>
                <span className="text-gray-400 block font-medium">Generated On:</span>
                <span className="font-bold text-gray-900">{formatDateTime(report.meta.generatedAt)}</span>
              </div>
              <div>
                <span className="text-gray-400 block font-medium">Prepared By:</span>
                <span className="font-bold text-gray-900">
                  {report.meta.generatedBy.name} ({report.meta.generatedBy.role}, {report.meta.generatedBy.scope})
                </span>
              </div>
              <div>
                <span className="text-gray-400 block font-medium">Reporting Period:</span>
                <span className="font-bold text-gray-900">
                  {applied.dateFrom ? formatDateDisplay(applied.dateFrom) : 'All Time'} to {applied.dateTo ? formatDateDisplay(applied.dateTo) : 'Present'}
                </span>
              </div>
              <div>
                <span className="text-gray-400 block font-medium">Filtered Records:</span>
                <span className="font-bold text-bgb-700">{derived.total} Filed Incidents</span>
              </div>
            </div>

            {/* Executive Summary Metrics Grid */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
              <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-center">
                <p className="text-2xl font-black text-blue-800 sm:text-3xl">{derived.total}</p>
                <p className="text-xs font-bold text-blue-700 mt-1 uppercase tracking-wider">Total Included</p>
              </div>
              <div className="rounded-xl border border-red-200 bg-red-50/70 p-4 text-center">
                <p className="text-2xl font-black text-red-800 sm:text-3xl">{derived.critical}</p>
                <p className="text-xs font-bold text-red-700 mt-1 uppercase tracking-wider">High &amp; Critical</p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-center">
                <p className="text-2xl font-black text-amber-800 sm:text-3xl">{derived.pending}</p>
                <p className="text-xs font-bold text-amber-700 mt-1 uppercase tracking-wider">Pending Action</p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-center">
                <p className="text-2xl font-black text-emerald-800 sm:text-3xl">{derived.resolved}</p>
                <p className="text-xs font-bold text-emerald-700 mt-1 uppercase tracking-wider">Approved / Closed</p>
              </div>
            </div>

            {/* Categorical & Unit Breakdown Tables */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-xs font-extrabold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                  <i className="fas fa-chart-pie text-bgb-600" /> Category Distribution
                </h3>
                <div className="overflow-hidden rounded-xl border border-gray-200">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead className="bg-gray-100 text-xs font-extrabold text-gray-600 uppercase border-b border-gray-200">
                      <tr>
                        <th className="py-2.5 px-4">Category</th>
                        <th className="py-2.5 px-4">Count</th>
                        <th className="py-2.5 px-4 text-right">Proportion</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-medium">
                      {derived.byCategory.map(({ category: cat, count }) => {
                        const pct = derived.total ? ((count / derived.total) * 100).toFixed(1) : 0;
                        return (
                          <tr key={cat} className="hover:bg-gray-50/80">
                            <td className="py-2.5 px-4 font-bold text-gray-900">{cat}</td>
                            <td className="py-2.5 px-4 font-semibold text-gray-700">{count}</td>
                            <td className="py-2.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <span className="font-mono text-xs text-gray-600">{pct}%</span>
                                <div className="h-1.5 w-16 bg-gray-200 rounded-full overflow-hidden">
                                  <div className="h-full bg-bgb-600 rounded-full" style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-xs font-extrabold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                  <i className="fas fa-building text-bgb-600" /> Sector Distribution
                </h3>
                <div className="overflow-hidden rounded-xl border border-gray-200">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead className="bg-gray-100 text-xs font-extrabold text-gray-600 uppercase border-b border-gray-200">
                      <tr>
                        <th className="py-2.5 px-4">Sector</th>
                        <th className="py-2.5 px-4">Count</th>
                        <th className="py-2.5 px-4 text-right">Proportion</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-medium">
                      {derived.bySector.map(({ sector: unit, total: count }) => {
                        const pct = derived.total ? ((count / derived.total) * 100).toFixed(1) : 0;
                        return (
                          <tr key={unit} className="hover:bg-gray-50/80">
                            <td className="py-2.5 px-4 font-bold text-gray-900">{unit}</td>
                            <td className="py-2.5 px-4 font-semibold text-gray-700">{count}</td>
                            <td className="py-2.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <span className="font-mono text-xs text-gray-600">{pct}%</span>
                                <div className="h-1.5 w-16 bg-gray-200 rounded-full overflow-hidden">
                                  <div className="h-full bg-blue-600 rounded-full" style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Master Incidents Table */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-extrabold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                  <i className="fas fa-list text-bgb-600" /> Master Incident Records ({report.incidents.length}
                  {report.meta.truncated ? ` of ${derived.total}; export for the full list` : ''})
                </h3>
                <span className="text-[11px] font-semibold text-gray-500">Newest first</span>
              </div>
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-gray-100 text-xs font-extrabold text-gray-600 uppercase border-b border-gray-200">
                    <tr>
                      <th className="py-3 px-3">Reference</th>
                      <th className="py-3 px-3">Title</th>
                      <th className="py-3 px-3">Battalion / BOP</th>
                      <th className="py-3 px-3">Category</th>
                      <th className="py-3 px-3">Severity</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3">Date (DD-MM-YYYY)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                    {report.incidents.map((i) => (
                      <tr key={i.id} className="hover:bg-gray-50 transition-colors">
                        <td className="py-2.5 px-3 font-mono font-bold text-bgb-700">{i.id}</td>
                        <td className="py-2.5 px-3 max-w-[160px] sm:max-w-xs truncate font-semibold text-gray-900">{i.title}</td>
                        <td className="py-2.5 px-3 text-xs text-gray-600">{i.battalion} ({i.bop})</td>
                        <td className="py-2.5 px-3 text-xs text-gray-600">{i.category}</td>
                        <td className="py-2.5 px-3">
                          <SeverityBadge severity={i.severity} />
                        </td>
                        <td className="py-2.5 px-3">
                          <StatusBadge status={i.status} />
                        </td>
                        <td className="py-2.5 px-3 font-mono text-xs text-gray-700 font-bold whitespace-nowrap">
                          {formatDateDisplay(i.date)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Official Signatures Block for Printing */}
            <div className="hidden print:grid grid-cols-2 gap-8 pt-12 text-center text-xs font-bold">
              <div>
                <div className="border-b border-black pb-1 mb-1">Prepared By: {report.meta.generatedBy.name}</div>
                <div>Duty Officer, Headquarters BGB</div>
              </div>
              <div>
                <div className="border-b border-black pb-1 mb-1">Approved By: Command Authority</div>
                <div>Headquarters Border Guard Bangladesh</div>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
