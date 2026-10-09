import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import * as incidentsApi from '../api/incidents';
import useApi, { useDebounced } from '../hooks/useApi';
import Card from '../components/ui/Card';
import ErrorState from '../components/ui/ErrorState';
import IncidentList from '../components/incidents/IncidentList';
import Spinner from '../components/ui/Spinner';

// Specs #15, #16 — search by reference number and filter; the server filters, scopes and paginates.
const EMPTY_FILTERS = { q: '', status: '', category: '', severity: '', date: '' };
const PAGE_SIZE = 25;

export default function Incidents() {
  const { meta, hasPermission } = useApp();
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
      page,
      pageSize: PAGE_SIZE,
    }),
    [q, filters.status, filters.category, filters.severity, filters.date, page],
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
              placeholder="Search by reference, title, description or location…"
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
            <span className="hidden sm:inline">Filters</span>
            {activeCount > (filters.q ? 1 : 0) && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-bgb-500" />}
          </button>
        </div>

        <div id="incident-filters" className={`${showMore ? 'grid' : 'hidden'} mt-3 grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid lg:grid-cols-5`}>
          <select id="filter-status" value={filters.status} onChange={set('status')} className="form-input" aria-label="Status">
            <option value="">All Status</option>
            {(meta?.statuses || []).map((s) => <option key={s}>{s}</option>)}
          </select>
          <select id="filter-category" value={filters.category} onChange={set('category')} className="form-input" aria-label="Category">
            <option value="">All Categories</option>
            {(meta?.categories || []).map((c) => <option key={c.id}>{c.name}</option>)}
          </select>
          <select id="filter-severity" value={filters.severity} onChange={set('severity')} className="form-input" aria-label="Severity">
            <option value="">All Severity</option>
            {(meta?.severities || []).map((s) => <option key={s}>{s}</option>)}
          </select>
          <input id="filter-date" type="date" value={filters.date} onChange={set('date')} className="form-input" aria-label="Date" />
          <button
            onClick={() => {
              setFilters(EMPTY_FILTERS);
              setPage(1);
            }}
            disabled={!activeCount}
            className="btn btn-secondary"
          >
            <i className="fas fa-times" /> Clear
          </button>
        </div>
      </Card>

      {/* List */}
      <Card
        title={`Incidents (${total})`}
        bodyClassName=""
        actions={
          hasPermission(null, 'create') && (
            <Link to="/incidents/new" className="btn btn-primary w-full sm:w-auto">
              <i className="fas fa-plus" /> New Incident
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
          <nav className="flex items-center justify-between gap-2 border-t border-gray-100 px-4 py-3 text-sm" aria-label="Pagination">
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
    </div>
  );
}
