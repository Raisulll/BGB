import { useState } from 'react';
import * as callsApi from '../api/calls';
import { useApp } from '../context/AppContext';
import { useComms } from '../context/CommsContext';
import useApi from '../hooks/useApi';
import { useI18n } from '../i18n/I18nContext';
import { cn, formatDateTime } from '../utils/helpers';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import Spinner from '../components/ui/Spinner';
import { formatDuration } from '../components/messaging/CallPanel';

// Call log (spec #58 extension, records per spec #24): every 1:1 audio call is a server record
// with its outcome and duration. Users see their own calls; roles with the admin or audit page
// can also see every call in the system. Audio itself is never recorded.

const PAGE_SIZE = 25;
const UNSUCCESSFUL = ['missed', 'declined', 'cancelled', 'failed'];

function StatusText({ call }) {
  const { tv } = useI18n();
  const missedIncoming = call.status === 'missed' && call.direction === 'incoming';
  return <span className={cn('text-sm', missedIncoming ? 'font-medium text-red-700' : UNSUCCESSFUL.includes(call.status) ? 'text-slate-600' : 'text-slate-900')}>{tv('callStatus', call.status)}</span>;
}

function Pager({ page, totalPages, loading, setPage }) {
  const { t } = useI18n();
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
      <span>{t('common.pageOf', { page, total: totalPages })}</span>
      <button onClick={() => setPage((p) => p - 1)} disabled={page <= 1 || loading} className="btn btn-secondary px-3" aria-label={t('common.prevPage')}>
        <i className="fas fa-chevron-left" aria-hidden="true" />
      </button>
      <button onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages || loading} className="btn btn-secondary px-3" aria-label={t('common.nextPage')}>
        <i className="fas fa-chevron-right" aria-hidden="true" />
      </button>
    </div>
  );
}

function MyCalls() {
  const { t, tv } = useI18n();
  const { startCall, call: live } = useComms();
  const [page, setPage] = useState(1);
  const { data, loading, error, message, reload } = useApi((signal) => callsApi.mine({ page, pageSize: PAGE_SIZE }, signal), [page]);

  if (error) return <ErrorState message={message} onRetry={reload} />;
  if (!data) return <Spinner />;
  if (data.total === 0) return <EmptyState icon="fa-phone" title={t('calls.logEmpty')}>{t('calls.logEmptyHint')}</EmptyState>;

  return (
    <>
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">{t('calls.col.person')}</th>
              <th className="th">{t('calls.col.direction')}</th>
              <th className="th">{t('calls.col.status')}</th>
              <th className="th">{t('calls.col.time')}</th>
              <th className="th">{t('calls.col.duration')}</th>
              <th className="th text-right">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.data.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="td">
                  <p className="text-sm font-medium text-slate-900">{c.other.name}</p>
                  <p className="text-xs text-slate-500">
                    {tv('role', c.other.role)} · {c.other.scope}
                  </p>
                </td>
                <td className="td text-sm text-slate-700">
                  <i className={`fas ${c.direction === 'incoming' ? 'fa-arrow-down' : 'fa-arrow-up'} mr-1.5 text-xs text-slate-400`} aria-hidden="true" />
                  {tv('callDirection', c.direction)}
                </td>
                <td className="td">
                  <StatusText call={c} />
                </td>
                <td className="td whitespace-nowrap text-sm text-slate-700">{formatDateTime(c.startedAt)}</td>
                <td className="td whitespace-nowrap font-mono text-sm tabular-nums text-slate-700">{c.durationSeconds != null ? formatDuration(c.durationSeconds) : '—'}</td>
                <td className="td text-right">
                  <button type="button" onClick={() => startCall(c.other)} disabled={Boolean(live)} className="btn btn-secondary btn-sm">
                    <i className="fas fa-phone" aria-hidden="true" />
                    {t('calls.callBack')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} totalPages={data.totalPages} loading={loading} setPage={setPage} />
    </>
  );
}

function AllCalls() {
  const { t, tv } = useI18n();
  const [page, setPage] = useState(1);
  const { data, loading, error, message, reload } = useApi((signal) => callsApi.all({ page, pageSize: PAGE_SIZE }, signal), [page]);

  if (error) return <ErrorState message={message} onRetry={reload} />;
  if (!data) return <Spinner />;
  if (data.total === 0) return <EmptyState icon="fa-phone" title={t('calls.logEmpty')} />;

  const person = (p) => (
    <>
      <p className="text-sm font-medium text-slate-900">{p.name}</p>
      <p className="text-xs text-slate-500">
        {tv('role', p.role)} · {p.scope}
      </p>
    </>
  );

  return (
    <>
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">{t('calls.col.caller')}</th>
              <th className="th">{t('calls.col.callee')}</th>
              <th className="th">{t('calls.col.status')}</th>
              <th className="th">{t('calls.col.time')}</th>
              <th className="th">{t('calls.col.duration')}</th>
              <th className="th">{t('calls.col.reason')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.data.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="td">{person(c.caller)}</td>
                <td className="td">{person(c.callee)}</td>
                <td className="td text-sm text-slate-900">{tv('callStatus', c.status)}</td>
                <td className="td whitespace-nowrap text-sm text-slate-700">{formatDateTime(c.startedAt)}</td>
                <td className="td whitespace-nowrap font-mono text-sm tabular-nums text-slate-700">{c.durationSeconds != null ? formatDuration(c.durationSeconds) : '—'}</td>
                <td className="td text-sm text-slate-600">{c.endReason ? tv('callReason', c.endReason) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} totalPages={data.totalPages} loading={loading} setPage={setPage} />
    </>
  );
}

export default function CallLog() {
  const { t } = useI18n();
  const { currentUser, hasPermission } = useApp();
  const canSeeAll = hasPermission(currentUser, 'admin') || hasPermission(currentUser, 'audit');
  const [tab, setTab] = useState('mine');

  const tabs = [
    { id: 'mine', label: t('calls.tab.mine') },
    ...(canSeeAll ? [{ id: 'all', label: t('calls.tab.all') }] : []),
  ];

  return (
    <div className="space-y-4">
      <Card bodyClassName="p-0">
        {tabs.length > 1 && (
          <div role="tablist" aria-label={t('page.calls.title')} className="flex gap-4 border-b border-slate-200 px-4">
            {tabs.map((x) => (
              <button
                key={x.id}
                role="tab"
                type="button"
                aria-selected={tab === x.id}
                onClick={() => setTab(x.id)}
                className={cn('-mb-px border-b-2 py-3 text-sm font-medium', tab === x.id ? 'border-bgb-700 text-bgb-800' : 'border-transparent text-slate-600 hover:text-slate-900')}
              >
                {x.label}
              </button>
            ))}
          </div>
        )}
        {tab === 'all' && canSeeAll ? <AllCalls /> : <MyCalls />}
      </Card>
      <p className="text-xs text-slate-500">
        <i className="fas fa-info-circle mr-1" aria-hidden="true" />
        {t('calls.logNotice')}
      </p>
    </div>
  );
}
