import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import * as incidentsApi from '../api/incidents';
import useApi, { useDebounced } from '../hooks/useApi';
import Card from '../components/ui/Card';
import ErrorState from '../components/ui/ErrorState';
import IncidentList from '../components/incidents/IncidentList';
import Spinner from '../components/ui/Spinner';
import { useI18n } from '../i18n/I18nContext';

// Specs #15, #16 — search by reference number and filter; the server filters, scopes and paginates.
const EMPTY_FILTERS = { q: '', status: '', category: '', severity: '', date: '', archived: '' };
const PAGE_SIZE = 25;

export default function Incidents() {
  const { meta, hasPermission } = useApp();
  const { t, tv } = useI18n();
  const [params] = useSearchParams();
  // Links from the dashboard and notifications can pre-set filters (?category=…&status=…)
  const [filters, setFilters] = useState(() => {
    const f = { ...EMPTY_FILTERS };
    for (const k of Object.keys(EMPTY_FILTERS)) if (params.get(k)) f[k] = params.get(k);
    return f;
  });
  const [page, setPage] = useState(1);
  const [showMore, setShowMore] = useState(false);
  const q = useDebounced(filters.q.trim());

  const set = (key) => (e) => {
    setFilters((f) => ({ ...f, [key]: e.target.value }));
    setPage(1);
  };
  const activeCount = Object.values(filters).filter(Boolean).length;

  const query = useMemo(
    () => ({
      q,
      status: filters.status,
      category: filters.category,
      severity: filters.severity,
      dateFrom: filters.date,
      dateTo: filters.date,
      archived: filters.archived, // '' = active records only (spec #45)
      page,
      pageSize: PAGE_SIZE,
    }),
    [q, filters.status, filters.category, filters.severity, filters.date, filters.archived, page],
  );
  const { data, loading, error, message, reload, setData } = useApi((signal) => incidentsApi.list(query, signal), [query]);

  // A quick action changed one row; swap in the updated record without refetching the page
  const onChanged = (updated) =>
    setData((d) => (d ? { ...d, data: d.data.map((i) => (i.id === updated.id ? { ...i, ...updated } : i)) } : d));

  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card bodyClassName="p-3 sm:p-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <i className="fas fa-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              id="search-ref"
              type="search"
              value={filters.q}
              onChange={set('q')}
              placeholder={t('incidents.searchPh')}
              className="form-input pl-10"
            />
          </div>
          <button
            onClick={() => setShowMore((s) => !s)}
            className="btn btn-secondary relative shrink-0 px-3 lg:hidden"
            aria-expanded={showMore}
            aria-controls="incident-filters"
          >
            <i className="fas fa-sliders-h" />
            <span className="hidden sm:inline">{t('incidents.filters')}</span>
            {activeCount > (filters.q ? 1 : 0) && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-bgb-500" />}
          </button>
        </div>

        <div id="incident-filters" className={`${showMore ? 'grid' : 'hidden'} mt-3 grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid lg:grid-cols-6`}>
          <select id="filter-status" value={filters.status} onChange={set('status')} className="form-input" aria-label={t('common.status')}>
            <option value="">{t('common.allStatus')}</option>
            {(meta?.statuses || []).map((s) => (
              <option key={s} value={s}>
                {tv('status', s)}
              </option>
            ))}
          </select>
          <select id="filter-category" value={filters.category} onChange={set('category')} className="form-input" aria-label={t('common.category')}>
            <option value="">{t('common.allCategories')}</option>
            {(meta?.categories || []).map((c) => <option key={c.id}>{c.name}</option>)}
          </select>
          <select id="filter-severity" value={filters.severity} onChange={set('severity')} className="form-input" aria-label={t('common.severity')}>
            <option value="">{t('common.allSeverity')}</option>
            {(meta?.severities || []).map((s) => (
              <option key={s} value={s}>
                {tv('severity', s)}
              </option>
            ))}
          </select>
          <select id="filter-archived" value={filters.archived} onChange={set('archived')} className="form-input" aria-label={t('incidents.archiveFilter')}>
            <option value="">{t('incidents.activeOnly')}</option>
            <option value="only">{t('incidents.archivedOnly')}</option>
            <option value="include">{t('incidents.allRecords')}</option>
          </select>
          <input id="filter-date" type="date" value={filters.date} onChange={set('date')} className="form-input" aria-label={t('incidents.dateFilter')} />
          <button
            onClick={() => {
              setFilters(EMPTY_FILTERS);
              setPage(1);
            }}
            disabled={!activeCount}
            className="btn btn-secondary"
          >
            <i className="fas fa-times" /> {t('common.clear')}
          </button>
        </div>
      </Card>

      {/* List */}
      <Card
        title={t('incidents.listTitle', { n: total })}
        bodyClassName=""
        actions={
          hasPermission(null, 'create') && (
            <Link to="/incidents/new" className="btn btn-primary w-full sm:w-auto">
              <i className="fas fa-plus" /> {t('incidents.new')}
            </Link>
          )
        }
      >
        {error ? (
          <ErrorState message={message} onRetry={reload} />
        ) : !data ? (
          <Spinner />
        ) : (
          <div className={loading ? 'pointer-events-none opacity-60 transition-opacity' : 'transition-opacity'}>
            <IncidentList incidents={data.data} onChanged={onChanged} />
          </div>
        )}

        {data && totalPages > 1 && (
          <nav className="flex items-center justify-between gap-2 border-t border-gray-100 px-4 py-3 text-sm" aria-label={t('common.pagination')}>
            <span className="text-gray-500">{t('common.pageOf', { page, total: totalPages })}</span>
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
    </div>
  );
}
