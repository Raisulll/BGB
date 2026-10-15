import { useState } from 'react';
import { Link } from 'react-router-dom';
import * as alertsApi from '../api/alerts';
import useApi from '../hooks/useApi';
import { useApp } from '../context/AppContext';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import Spinner from '../components/ui/Spinner';
import { AlertPriorityBadge, AlertStateBadge, useAlertArea } from '../components/alerts/AlertBits';
import { cn, formatDateTime } from '../utils/helpers';
import { useI18n } from '../i18n/I18nContext';

// Flash Alerts register (spec #23/#58 extension): every alert the user received or sent; the
// sender, administrators and auditors also see acknowledgement progress.
const TABS = ['active', 'closed', 'all'];
const PAGE_SIZE = 20;

export default function Alerts() {
  const { hasPermission } = useApp();
  const { t, tv } = useI18n();
  const area = useAlertArea();
  const [state, setState] = useState('active');
  const [page, setPage] = useState(1);
  const { data, error, message, reload, loading } = useApi((signal) => alertsApi.list({ state, page, pageSize: PAGE_SIZE }, signal), [state, page]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <nav className="flex gap-1 rounded-md border border-slate-200 bg-white p-1 shadow-sm" aria-label={t('alerts.views')}>
          {TABS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setState(id);
                setPage(1);
              }}
              aria-current={state === id ? 'page' : undefined}
              className={cn('rounded px-3 py-1.5 text-sm font-medium', state === id ? 'bg-bgb-700 text-white' : 'text-slate-600 hover:bg-slate-100')}
            >
              {t(`alerts.tab.${id}`)}
            </button>
          ))}
        </nav>
        {loading && <i className="fas fa-spinner fa-spin text-bgb-500" aria-hidden="true" />}
        {hasPermission(null, 'raise_alert') && (
          <Link to="/alerts/new" className="btn btn-danger ml-auto">
            <i className="fas fa-triangle-exclamation" aria-hidden="true" />
            {t('alerts.raise')}
          </Link>
        )}
      </div>

      {error ? (
        <Card>
          <ErrorState message={message} onRetry={reload} />
        </Card>
      ) : !data ? (
        <Spinner />
      ) : data.data.length === 0 ? (
        <Card>
          <EmptyState icon="fa-shield-halved" title={t(`alerts.empty.${state}`)}>
            {t('alerts.emptyHint')}
          </EmptyState>
        </Card>
      ) : (
        <ul className="space-y-3">
          {data.data.map((a) => (
            <li key={a.id}>
              <Link
                to={`/alerts/${a.id}`}
                className={cn('card block border-l-4 p-4 hover:bg-slate-50', a.state === 'active' ? 'border-l-red-700' : 'border-l-slate-300')}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm text-slate-700">{a.reference}</span>
                  <AlertPriorityBadge priority={a.priority} />
                  <AlertStateBadge state={a.state} />
                  {a.me.recipient && (
                    <span className={cn('text-xs font-medium', a.me.acknowledgedAt ? 'text-emerald-700' : 'text-red-700')}>
                      {a.me.acknowledgedAt ? t('alerts.youAcknowledged') : t('alerts.youNotAcknowledged')}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-slate-500">{formatDateTime(a.createdAt)}</span>
                </div>
                <p className="mt-2 font-semibold text-slate-900">{a.title}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {tv('alertThreat', a.threatType)} · {area(a)} · {t('alerts.byName', { name: a.sender.name })}
                  {a.canClose && ` · ${t('alerts.ackProgress', { n: a.counts.acknowledged, total: a.counts.recipients })}`}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label={t('alerts.prevPage')}>
            <i className="fas fa-chevron-left" aria-hidden="true" />
          </button>
          <span>{t('alerts.pageOf', { page, total: data.totalPages })}</span>
          <button type="button" className="btn btn-secondary btn-sm" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)} aria-label={t('alerts.nextPage')}>
            <i className="fas fa-chevron-right" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
