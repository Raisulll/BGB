import { useMemo, useState } from 'react';
import { useToast } from '../context/ToastContext';
import * as auditApi from '../api/audit';
import { errorMessage } from '../api/client';
import useApi, { useDebounced } from '../hooks/useApi';
import { formatDateTime } from '../utils/helpers';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import Spinner from '../components/ui/Spinner';
import { useI18n } from '../i18n/I18nContext';

// Security alerts stand out in red; every other action is a neutral label
const ALERT_ACTIONS = new Set(['LOGIN_FAILED', 'LOGIN_BLOCKED', 'ACCOUNT_LOCKED', 'TOKEN_REUSE', 'EVIDENCE_INTEGRITY_FAILURE', 'DENIED_UPDATE', 'DENIED_WORKFLOW', 'UPLOAD_REJECTED']);

const PAGE_SIZE = 50;
const EMPTY = { q: '', action: '', date: '' };

// Spec #24 — the server's append-only, SHA-256 hash-chained audit log. Viewing, searching,
// verifying and exporting are themselves audited by the server.
export default function AuditTrail() {
  const { showToast } = useToast();
  const { t, tv } = useI18n();

  const [filters, setFilters] = useState(EMPTY);
  const [page, setPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState(null);
  const [chain, setChain] = useState(null); // result of /audit/verify
  const [busy, setBusy] = useState(null);
  const q = useDebounced(filters.q.trim(), 500);

  const set = (key) => (e) => {
    setFilters((f) => ({ ...f, [key]: e.target.value }));
    setPage(1);
  };
  const query = useMemo(
    () => ({ q, action: filters.action, dateFrom: filters.date, dateTo: filters.date, page, pageSize: PAGE_SIZE }),
    [q, filters.action, filters.date, page],
  );
  const { data, error, message, reload, loading } = useApi(() => auditApi.list(query), [query]);
  const exportFilters = { q, action: filters.action, dateFrom: filters.date, dateTo: filters.date };
  const anyFilter = Boolean(filters.q || filters.action || filters.date);

  const verifyChain = async () => {
    setBusy('verify');
    try {
      const result = await auditApi.verify();
      setChain(result);
      if (result.intact) showToast(t('audit.chainOk', { n: result.rowsChecked }), 'success');
      else showToast(t('audit.chainBroken', { seq: result.firstBrokenSeq }), 'error');
    } catch (err) {
      showToast(errorMessage(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  const doExport = async (format) => {
    setBusy(format);
    try {
      const name = await auditApi.exportLog(format, exportFilters);
      showToast(t('common.downloaded', { name }), 'success');
    } catch (err) {
      showToast(errorMessage(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const logs = data?.data || [];
  const totalPages = data?.totalPages || 1;

  return (
    <div className="space-y-6">
      {/* Executive Security KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-bgb-200 bg-bgb-50 text-lg font-bold text-bgb-700">
            <i className="fas fa-clipboard-list" />
          </div>
          <div>
            <div className="text-2xl font-semibold text-gray-900">{data ? data.total : '…'}</div>
            <div className="text-xs font-bold text-gray-500">{anyFilter ? t('audit.matching') : t('audit.totalEntries')}</div>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-lg font-bold text-blue-700">
            <i className="fas fa-link" />
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">{t('audit.chainTitle')}</div>
            <div className="text-xs font-medium text-gray-500">{t('audit.chainHint')}</div>
          </div>
        </div>

        <div
          className={`flex items-center gap-4 rounded-lg border p-4 shadow-sm ${
            !chain ? 'border-gray-200 bg-white' : chain.intact ? 'border-bgb-200 bg-bgb-50/60' : 'border-red-300 bg-red-50'
          }`}
        >
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border text-lg font-bold ${
              !chain ? 'border-gray-200 bg-gray-50 text-gray-500' : chain.intact ? 'border-bgb-300 bg-bgb-100 text-bgb-800' : 'border-red-300 bg-red-100 text-red-700'
            }`}
          >
            <i className={`fas ${!chain ? 'fa-question' : chain.intact ? 'fa-check-double' : 'fa-unlink'}`} />
          </div>
          <div className="min-w-0 flex-1">
            {!chain ? (
              <div className="text-xs font-bold text-gray-500">{t('audit.notChecked')}</div>
            ) : chain.intact ? (
              <>
                <div className="text-xs font-semibold text-bgb-800">{t('audit.intact')}</div>
                <div className="text-xs font-bold text-bgb-700">
                  {t('audit.entriesAt', { n: chain.rowsChecked, date: formatDateTime(chain.checkedAt) })}
                </div>
              </>
            ) : (
              <>
                <div className="text-xs font-semibold text-red-800">{t('audit.tampering')}</div>
                <div className="text-xs font-bold text-red-700">{t('audit.brokenAt', { seq: chain.firstBrokenSeq })}</div>
              </>
            )}
            <button type="button" onClick={verifyChain} disabled={Boolean(busy)} className="mt-1 text-xs font-bold text-bgb-700 hover:underline print:hidden">
              <i className={`fas ${busy === 'verify' ? 'fa-spinner fa-spin' : 'fa-shield-alt'} mr-1`} />
              {chain ? t('audit.verifyAgain') : t('audit.verifyNow')}
            </button>
          </div>
        </div>
      </div>

      {/* Advanced Search & Control Bar */}
      <Card bodyClassName="p-4 sm:p-5" className="print:hidden">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3 flex-1">
            <div className="relative">
              <i className="fas fa-search pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
              <input
                type="search"
                value={filters.q}
                onChange={set('q')}
                placeholder={t('audit.searchPh')}
                className="form-input pl-10 text-xs font-semibold"
              />
            </div>

            <select value={filters.action} onChange={set('action')} className="form-input text-xs font-semibold" aria-label={t('audit.actionType')}>
              <option value="">{t('audit.allActions')}</option>
              {(data?.actions || []).map((a) => (
                <option key={a} value={a}>
                  {tv('auditAction', a)}
                </option>
              ))}
            </select>

            <input type="date" value={filters.date} onChange={set('date')} className="form-input text-xs font-semibold" aria-label={t('audit.dateBst')} />
          </div>

          <div className="flex items-center gap-2">
            {anyFilter && (
              <button
                type="button"
                onClick={() => {
                  setFilters(EMPTY);
                  setPage(1);
                  showToast(t('audit.cleared'), 'info');
                }}
                className="btn btn-ghost py-2 px-3 text-xs font-bold text-gray-600 border border-gray-200"
              >
                {t('common.clear')}
              </button>
            )}
            <button
              type="button"
              onClick={() => doExport('csv')}
              disabled={Boolean(busy)}
              className="btn btn-secondary py-2 px-3.5 text-xs font-bold text-bgb-700"
            >
              <i className={`fas ${busy === 'csv' ? 'fa-spinner fa-spin' : 'fa-file-csv'} mr-1`} /> CSV
            </button>
            <button
              type="button"
              onClick={() => doExport('excel')}
              disabled={Boolean(busy)}
              className="btn btn-secondary py-2 px-3.5 text-xs font-bold text-bgb-700"
            >
              <i className={`fas ${busy === 'excel' ? 'fa-spinner fa-spin' : 'fa-file-excel'} mr-1`} /> {t('audit.excel')}
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="btn btn-primary py-2 px-3.5 text-xs font-bold"
            >
              <i className="fas fa-print mr-1" /> {t('audit.print')}
            </button>
          </div>
        </div>
      </Card>

      {/* Main Audit Trail Data Table */}
      <Card
        title={data ? t('audit.trailCount', { n: data.total }) : t('audit.trailTitle')}
        icon="fa-history"
        bodyClassName="p-0"
      >
        {error ? (
          <ErrorState message={message} onRetry={reload} />
        ) : !data ? (
          <Spinner />
        ) : logs.length === 0 ? (
          <EmptyState icon="fa-history" title={t('audit.empty')}>
            {t('audit.emptyHint')}
          </EmptyState>
        ) : (
          <div className={`overflow-x-auto ${loading ? 'opacity-60' : ''}`}>
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-gray-100 text-xs font-semibold text-gray-600 uppercase border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4"># ID</th>
                  <th className="py-3 px-4">{t('audit.thTime')}</th>
                  <th className="py-3 px-4">{t('audit.thUser')}</th>
                  <th className="py-3 px-4">{t('audit.thAction')}</th>
                  <th className="py-3 px-4 hidden md:table-cell">{t('audit.thDetails')}</th>
                  <th className="py-3 px-4 hidden lg:table-cell">{t('audit.thIp')}</th>
                  <th className="py-3 px-4 text-right print:hidden">{t('audit.thInspect')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                {logs.map((log) => {
                  const alert = ALERT_ACTIONS.has(log.action);
                  return (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className="hover:bg-bgb-50/50 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4 font-mono font-bold text-gray-400">#{log.seq}</td>
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-xs text-gray-700 font-semibold">
                        {formatDateTime(log.timestamp, { withSeconds: true })}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-bold text-gray-900">{log.username}</span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${alert ? 'border-red-200 bg-red-50 text-red-800' : 'border-slate-200 bg-slate-50 text-slate-800'}`}
                        >
                          {tv('auditAction', log.action)}
                        </span>
                      </td>
                      <td className="py-3 px-4 hidden max-w-xs truncate text-gray-600 md:table-cell">
                        {log.details}
                      </td>
                      <td className="py-3 px-4 hidden font-mono text-xs text-gray-500 lg:table-cell">
                        {log.ip || '—'}
                      </td>
                      <td className="py-3 px-4 text-right print:hidden">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLog(log);
                          }}
                          className="btn btn-sm btn-secondary"
                          title={t('audit.inspectTitle')}
                        >
                          {t('audit.details')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data && totalPages > 1 && (
          <nav className="flex items-center justify-between gap-2 border-t border-gray-100 px-4 py-3 text-sm print:hidden" aria-label={t('common.pagination')}>
            <span className="text-gray-500">
              {t('common.pageOf', { page, total: totalPages })}
            </span>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => p - 1)} disabled={page <= 1 || loading} className="btn btn-secondary px-3" aria-label={t('common.prevPage')}>
                <i className="fas fa-chevron-left" />
              </button>
              <button onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages || loading} className="btn btn-secondary px-3" aria-label={t('common.nextPage')}>
                <i className="fas fa-chevron-right" />
              </button>
            </div>
          </nav>
        )}
      </Card>

      {/* Log Inspection Modal */}
      {selectedLog && (
        <div
          onClick={() => setSelectedLog(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-lg bg-white p-6 shadow-lg border border-gray-200 text-gray-900 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-bgb-50 text-bgb-700 font-bold border border-bgb-200">
                  <i className="fas fa-shield-alt text-sm" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-gray-900">{t('audit.inspector')}</h3>
                  <p className="text-xs font-mono text-gray-500">{t('audit.seq', { seq: selectedLog.seq })}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="btn btn-ghost p-1.5 text-gray-400 hover:text-gray-600"
              >
                <i className="fas fa-times text-sm" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-gray-50 rounded-md p-3 border border-gray-200">
                <div>
                  <span className="text-gray-400 block font-medium">{t('audit.timestamp')}</span>
                  <span className="font-mono font-bold text-gray-900">{formatDateTime(selectedLog.timestamp, { withSeconds: true })}</span>
                </div>
                <div>
                  <span className="text-gray-400 block font-medium">{t('audit.identity')}</span>
                  <span className="font-bold text-bgb-800">
                    {selectedLog.username}
                    {selectedLog.userId ? ` (${selectedLog.userId})` : ''}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 block font-medium">{t('audit.performed')}</span>
                  <span className="font-mono font-bold text-bgb-700">{selectedLog.action}</span>
                  <span className="block text-xs text-gray-500">{tv('auditAction', selectedLog.action)}</span>
                </div>
                <div>
                  <span className="text-gray-400 block font-medium">{t('audit.ip')}</span>
                  <span className="font-mono font-bold text-gray-800">{selectedLog.ip || '—'}</span>
                </div>
              </div>

              <div>
                <span className="text-gray-500 font-bold block mb-1">{t('audit.narrative')}</span>
                <div className="break-words rounded-md bg-gray-900 p-3 text-bgb-400 font-mono text-xs leading-relaxed">
                  {selectedLog.details || '—'}
                </div>
                {selectedLog.userAgent && <p className="mt-1 truncate text-xs text-gray-400" title={selectedLog.userAgent}>{selectedLog.userAgent}</p>}
              </div>

              <div>
                <span className="text-gray-500 font-bold block mb-1">{t('audit.seal')}</span>
                <div className="space-y-1 rounded-lg border border-gray-200 bg-gray-100 p-2 font-mono text-xs text-gray-600">
                  <p className="break-all"><span className="text-gray-400">row  </span>{selectedLog.rowHash}</p>
                  <p className="break-all"><span className="text-gray-400">prev </span>{selectedLog.prevHash}</p>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="btn btn-primary py-2 px-5 text-xs font-bold"
              >
                {t('audit.closeInspector')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
