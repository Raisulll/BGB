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

const ACTION_CONFIG = {
  LOGIN: { label: 'LOGIN', cls: 'bg-blue-50 text-blue-700 border-blue-200', icon: 'fa-key' },
  LOGOUT: { label: 'LOGOUT', cls: 'bg-gray-100 text-gray-700 border-gray-300', icon: 'fa-sign-out-alt' },
  CREATE_INCIDENT: { label: 'CREATE INCIDENT', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: 'fa-plus-circle' },
  UPDATE_INCIDENT: { label: 'UPDATE INCIDENT', cls: 'bg-amber-50 text-amber-700 border-amber-200', icon: 'fa-edit' },
  SUBMIT_INCIDENT: { label: 'SUBMIT INCIDENT', cls: 'bg-blue-50 text-blue-700 border-blue-200', icon: 'fa-paper-plane' },
  REVIEW_INCIDENT: { label: 'REVIEW INCIDENT', cls: 'bg-yellow-50 text-yellow-800 border-yellow-200', icon: 'fa-search' },
  VERIFY_INCIDENT: { label: 'VERIFY INCIDENT', cls: 'bg-teal-50 text-teal-700 border-teal-200', icon: 'fa-check-double' },
  APPROVE_INCIDENT: { label: 'APPROVE INCIDENT', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300', icon: 'fa-shield-alt' },
  CREATE_USER: { label: 'CREATE USER', cls: 'bg-purple-50 text-purple-700 border-purple-200', icon: 'fa-user-plus' },
  ROLE_CHANGE: { label: 'ROLE CHANGE', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: 'fa-user-cog' },
  PASSWORD_RESET: { label: 'PASSWORD RESET', cls: 'bg-red-50 text-red-700 border-red-200', icon: 'fa-key' },
  VIEW_AUDIT_LOG: { label: 'VIEW AUDIT LOG', cls: 'bg-navy-50 text-navy-700 border-navy-200', icon: 'fa-clipboard-list' },
  EXPORT_REPORT: { label: 'EXPORT REPORT', cls: 'bg-cyan-50 text-cyan-700 border-cyan-200', icon: 'fa-file-export' },
  LOGIN_FAILED: { label: 'LOGIN FAILED', cls: 'bg-orange-50 text-orange-700 border-orange-200', icon: 'fa-exclamation-triangle' },
  LOGIN_BLOCKED: { label: 'LOGIN BLOCKED', cls: 'bg-red-50 text-red-700 border-red-200', icon: 'fa-ban' },
  ACCOUNT_LOCKED: { label: 'ACCOUNT LOCKED', cls: 'bg-red-100 text-red-800 border-red-300', icon: 'fa-user-lock' },
  SESSION_TIMEOUT: { label: 'SESSION TIMEOUT', cls: 'bg-gray-100 text-gray-700 border-gray-300', icon: 'fa-hourglass-end' },
  TOKEN_REUSE: { label: 'TOKEN REUSE', cls: 'bg-red-100 text-red-800 border-red-300', icon: 'fa-user-secret' },
  DENIED_WORKFLOW: { label: 'DENIED WORKFLOW', cls: 'bg-red-50 text-red-700 border-red-200', icon: 'fa-hand-paper' },
  DENIED_UPDATE: { label: 'DENIED UPDATE', cls: 'bg-red-50 text-red-700 border-red-200', icon: 'fa-hand-paper' },
  PERMISSION_DENIED: { label: 'PERMISSION DENIED', cls: 'bg-red-50 text-red-700 border-red-200', icon: 'fa-hand-paper' },
  AUDIT_CHAIN_BROKEN: { label: 'CHAIN BROKEN', cls: 'bg-red-100 text-red-800 border-red-300', icon: 'fa-unlink' },
  CONFIG_CHANGE: { label: 'CONFIG CHANGE', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: 'fa-shield-alt' },
};

const PAGE_SIZE = 50;
const EMPTY = { q: '', action: '', date: '' };

// Spec #24 — the server's append-only, SHA-256 hash-chained audit log. Viewing, searching,
// verifying and exporting are themselves audited by the server.
export default function AuditTrail() {
  const { showToast } = useToast();

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
      if (result.intact) showToast(`Hash chain intact: ${result.rowsChecked} entries verified`, 'success');
      else showToast(`TAMPERING DETECTED: hash chain broken at entry #${result.firstBrokenSeq}`, 'error');
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
      showToast(`Downloaded ${name}`, 'success');
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
        <div className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-bgb-200 bg-bgb-50 text-lg font-bold text-bgb-700">
            <i className="fas fa-clipboard-list" />
          </div>
          <div>
            <div className="text-2xl font-black text-gray-900">{data ? data.total : '…'}</div>
            <div className="text-xs font-bold uppercase tracking-wider text-gray-500">{anyFilter ? 'Matching Entries' : 'Total Audit Log Entries'}</div>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 text-lg font-bold text-blue-700">
            <i className="fas fa-link" />
          </div>
          <div>
            <div className="text-sm font-black text-gray-900">SHA-256 Hash Chain</div>
            <div className="text-[11px] font-medium text-gray-500">Append-only; each entry seals the previous one</div>
          </div>
        </div>

        <div
          className={`flex items-center gap-4 rounded-2xl border p-4 shadow-sm ${
            !chain ? 'border-gray-200 bg-white' : chain.intact ? 'border-emerald-200 bg-emerald-50/60' : 'border-red-300 bg-red-50'
          }`}
        >
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border text-lg font-bold ${
              !chain ? 'border-gray-200 bg-gray-50 text-gray-500' : chain.intact ? 'border-emerald-300 bg-emerald-100 text-emerald-800' : 'border-red-300 bg-red-100 text-red-700'
            }`}
          >
            <i className={`fas ${!chain ? 'fa-question' : chain.intact ? 'fa-check-double' : 'fa-unlink'}`} />
          </div>
          <div className="min-w-0 flex-1">
            {!chain ? (
              <div className="text-xs font-bold uppercase tracking-wider text-gray-500">Integrity not checked this visit</div>
            ) : chain.intact ? (
              <>
                <div className="text-xs font-extrabold uppercase tracking-wider text-emerald-800">Chain Intact</div>
                <div className="text-[11px] font-bold text-emerald-700">
                  {chain.rowsChecked} entries &bull; {formatDateTime(chain.checkedAt)}
                </div>
              </>
            ) : (
              <>
                <div className="text-xs font-extrabold uppercase tracking-wider text-red-800">Tampering Detected</div>
                <div className="text-[11px] font-bold text-red-700">Broken at entry #{chain.firstBrokenSeq}</div>
              </>
            )}
            <button type="button" onClick={verifyChain} disabled={Boolean(busy)} className="mt-1 text-[11px] font-bold text-bgb-700 hover:underline print:hidden">
              <i className={`fas ${busy === 'verify' ? 'fa-spinner fa-spin' : 'fa-shield-alt'} mr-1`} />
              {chain ? 'Verify again' : 'Verify integrity now'}
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
                placeholder="Search user, action, details, IP..."
                className="form-input pl-10 text-xs font-semibold"
              />
            </div>

            <select value={filters.action} onChange={set('action')} className="form-input text-xs font-semibold" aria-label="Action type">
              <option value="">All Action Types</option>
              {(data?.actions || []).map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>

            <input type="date" value={filters.date} onChange={set('date')} className="form-input text-xs font-semibold" aria-label="Date (Bangladesh time)" />
          </div>

          <div className="flex items-center gap-2">
            {anyFilter && (
              <button
                type="button"
                onClick={() => {
                  setFilters(EMPTY);
                  setPage(1);
                  showToast('Cleared audit filters', 'info');
                }}
                className="btn btn-ghost py-2 px-3 text-xs font-bold text-gray-600 border border-gray-200"
              >
                Clear
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
              className="btn btn-secondary py-2 px-3.5 text-xs font-bold text-emerald-700"
            >
              <i className={`fas ${busy === 'excel' ? 'fa-spinner fa-spin' : 'fa-file-excel'} mr-1`} /> Excel
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="btn btn-primary py-2 px-3.5 text-xs font-bold"
            >
              <i className="fas fa-print mr-1" /> Print Log
            </button>
          </div>
        </div>
      </Card>

      {/* Main Audit Trail Data Table */}
      <Card
        title={`Audit Event Trail${data ? ` (${data.total} events)` : ''}`}
        icon="fa-history"
        bodyClassName="p-0"
      >
        {error ? (
          <ErrorState message={message} onRetry={reload} />
        ) : !data ? (
          <Spinner />
        ) : logs.length === 0 ? (
          <EmptyState icon="fa-history" title="No matching audit entries">
            Try adjusting your search query or filter parameters.
          </EmptyState>
        ) : (
          <div className={`overflow-x-auto ${loading ? 'opacity-60' : ''}`}>
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-gray-100 text-xs font-extrabold text-gray-600 uppercase border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4"># ID</th>
                  <th className="py-3 px-4">Timestamp (BST)</th>
                  <th className="py-3 px-4">User Account</th>
                  <th className="py-3 px-4">Event Action</th>
                  <th className="py-3 px-4 hidden md:table-cell">Event Details</th>
                  <th className="py-3 px-4 hidden lg:table-cell">IP Address</th>
                  <th className="py-3 px-4 text-right print:hidden">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                {logs.map((log) => {
                  const cfg = ACTION_CONFIG[log.action] || {
                    label: log.action,
                    cls: 'bg-gray-100 text-gray-700 border-gray-200',
                    icon: 'fa-info-circle',
                  };
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
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-[11px] font-extrabold ${cfg.cls}`}
                        >
                          <i className={`fas ${cfg.icon} text-[10px]`} /> {cfg.label}
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
                          className="btn btn-ghost p-1.5 text-bgb-600 hover:text-bgb-800"
                          title="Inspect Event Payload"
                        >
                          <i className="fas fa-search-plus text-xs" />
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
          <nav className="flex items-center justify-between gap-2 border-t border-gray-100 px-4 py-3 text-sm print:hidden" aria-label="Pagination">
            <span className="text-gray-500">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => p - 1)} disabled={page <= 1 || loading} className="btn btn-secondary px-3" aria-label="Previous page">
                <i className="fas fa-chevron-left" />
              </button>
              <button onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages || loading} className="btn btn-secondary px-3" aria-label="Next page">
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl border border-gray-200 text-gray-900 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-bgb-50 text-bgb-700 font-bold border border-bgb-200">
                  <i className="fas fa-shield-alt text-sm" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-gray-900">Audit Log Event Inspection</h3>
                  <p className="text-[11px] font-mono text-gray-500">Chain sequence #{selectedLog.seq}</p>
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
              <div className="grid grid-cols-2 gap-3 bg-gray-50 rounded-xl p-3 border border-gray-200">
                <div>
                  <span className="text-gray-400 block font-medium">Timestamp (BST):</span>
                  <span className="font-mono font-bold text-gray-900">{formatDateTime(selectedLog.timestamp, { withSeconds: true })}</span>
                </div>
                <div>
                  <span className="text-gray-400 block font-medium">User Identity:</span>
                  <span className="font-bold text-bgb-800">
                    {selectedLog.username}
                    {selectedLog.userId ? ` (${selectedLog.userId})` : ''}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 block font-medium">Action Performed:</span>
                  <span className="font-mono font-bold text-emerald-700">{selectedLog.action}</span>
                </div>
                <div>
                  <span className="text-gray-400 block font-medium">Origin IP Address:</span>
                  <span className="font-mono font-bold text-gray-800">{selectedLog.ip || '—'}</span>
                </div>
              </div>

              <div>
                <span className="text-gray-500 font-bold block mb-1">Event Narrative Details:</span>
                <div className="break-words rounded-xl bg-gray-900 p-3 text-emerald-400 font-mono text-xs leading-relaxed">
                  {selectedLog.details || '—'}
                </div>
                {selectedLog.userAgent && <p className="mt-1 truncate text-[10px] text-gray-400" title={selectedLog.userAgent}>{selectedLog.userAgent}</p>}
              </div>

              <div>
                <span className="text-gray-500 font-bold block mb-1">Hash Chain Seal (SHA-256):</span>
                <div className="space-y-1 rounded-lg border border-gray-200 bg-gray-100 p-2 font-mono text-[10px] text-gray-600">
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
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
