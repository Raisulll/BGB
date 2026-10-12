import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import * as incidentsApi from '../api/incidents';
import useApi, { useDebounced } from '../hooks/useApi';
import Card from '../components/ui/Card';
import ErrorState from '../components/ui/ErrorState';
import IncidentList from '../components/incidents/IncidentList';
import Spinner from '../components/ui/Spinner';
import { cn } from '../utils/helpers';
import { useI18n } from '../i18n/I18nContext';

// Specs #15, #16 — search by reference number and filter; the server filters, scopes and paginates.
// Views: everything in scope, what needs the user's action (server's workflow table), their own
// records, their drafts. View and filters live in the URL so links and reloads keep them.
const EMPTY_FILTERS = { q: '', status: '', category: '', severity: '', dateFrom: '', dateTo: '', sector: '', battalion: '', bop: '', archived: '', overdue: '', sort: '' };
const DEFAULT_SORT = 'createdAt:desc';
const SORTS = [
  ['createdAt:desc', 'incidents.sortNewest'],
  ['createdAt:asc', 'incidents.sortOldest'],
  ['incidentDate:desc', 'incidents.sortDateDesc'],
  ['incidentDate:asc', 'incidents.sortDateAsc'],
  ['id:desc', 'incidents.sortRef'],
];
const VIEW_QUERY = {
  all: {},
  action: { needsAction: 'true' },
  mine: { createdBy: 'me' },
  drafts: { createdBy: 'me', status: 'Draft' },
};
const PAGE_SIZE = 25;

export default function Incidents() {
  const { meta, hasPermission } = useApp();
  const { t, tv } = useI18n();
  const [params, setParams] = useSearchParams();
  // Opened from a GIS map location: offer the way back to the map as it was left
  const location = useLocation();
  const mapBack = location.state?.backTo?.startsWith('/map') ? location.state.backTo : null;
  const canCreate = hasPermission(null, 'create');
  const canAct = Boolean(meta?.canAct) || canCreate; // filers act on their own returned reports

  const views = [
    { id: 'all', label: t('incidents.viewAll'), icon: 'fa-list' },
    canAct && { id: 'action', label: t('incidents.viewAction'), icon: 'fa-bell' },
    canCreate && { id: 'mine', label: t('incidents.viewMine'), icon: 'fa-user' },
    canCreate && { id: 'drafts', label: t('incidents.viewDrafts'), icon: 'fa-pencil-alt' },
  ].filter(Boolean);
  const view = views.some((v) => v.id === params.get('view')) ? params.get('view') : 'all';

  // Links from the dashboard and notifications can pre-set filters (?category=…&status=…)
  const [filters, setFilters] = useState(() => {
    const f = { ...EMPTY_FILTERS };
    for (const k of Object.keys(EMPTY_FILTERS)) if (params.get(k)) f[k] = params.get(k);
    if (params.get('date')) f.dateFrom = f.dateTo = params.get('date'); // older single-day links
    return f;
  });
  const [page, setPage] = useState(1);
  const [showMore, setShowMore] = useState(false);

  // The header search can open this page again with a new ?q= while it's already mounted
  const urlQ = params.get('q');
  useEffect(() => {
    if (urlQ !== null) {
      setFilters((f) => (f.q === urlQ ? f : { ...f, q: urlQ }));
      setPage(1);
    }
  }, [urlQ]);
  const q = useDebounced(filters.q.trim());

  const writeUrl = (nextView, nextFilters) => {
    const p = new URLSearchParams();
    if (nextView !== 'all') p.set('view', nextView);
    for (const [k, v] of Object.entries(nextFilters)) if (v && k !== 'q') p.set(k, v);
    setParams(p, { replace: true, state: location.state }); // keeps "Back to the map"
  };
  const update = (patch) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    writeUrl(view, next);
    setPage(1);
  };
  const set = (key) => (e) => update({ [key]: e.target.value });
  const chooseView = (id) => {
    writeUrl(id, filters);
    setPage(1);
  };
  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    writeUrl(view, EMPTY_FILTERS);
    setPage(1);
  };

  // Units narrow down: sector → battalion → BOP, from the user's own scope (meta.hierarchy)
  const hierarchy = meta?.hierarchy || {};
  const battalions = filters.sector ? Object.keys(hierarchy[filters.sector] || {}) : [];
  const bops = filters.sector && filters.battalion ? hierarchy[filters.sector]?.[filters.battalion]?.BOPs || [] : [];

  const activeCount = Object.entries(filters).filter(([k, v]) => v && !(k === 'sort' && v === DEFAULT_SORT)).length;
  const [sortField, sortOrder] = (filters.sort || DEFAULT_SORT).split(':');

  const query = useMemo(
    () => ({
      q,
      status: filters.status,
      category: filters.category,
      severity: filters.severity,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      sector: filters.sector,
      battalion: filters.battalion,
      bop: filters.bop,
      archived: filters.archived, // '' = active records only (spec #45)
      overdue: filters.overdue, // 'true' = waiting longer than workflow.overdue_days
      sort: sortField,
      order: sortOrder,
      ...VIEW_QUERY[view],
      page,
      pageSize: PAGE_SIZE,
    }),
    [q, filters.status, filters.category, filters.severity, filters.dateFrom, filters.dateTo, filters.sector, filters.battalion, filters.bop, filters.archived, filters.overdue, sortField, sortOrder, view, page],
  );
  const { data, loading, error, message, reload, setData } = useApi((signal) => incidentsApi.list(query, signal), [query]);

  // Badge counts for the work views; refreshed whenever the list reloads
  const { data: counts } = useApi(
    async (signal) => {
      const [action, drafts] = await Promise.all([
        canAct ? incidentsApi.list({ ...VIEW_QUERY.action, pageSize: 1 }, signal) : null,
        canCreate ? incidentsApi.list({ ...VIEW_QUERY.drafts, pageSize: 1 }, signal) : null,
      ]);
      return { action: action?.total ?? 0, drafts: drafts?.total ?? 0 };
    },
    [canAct, canCreate, data],
  );

  // A quick action changed one row; swap in the updated record without refetching the page
  const onChanged = (updated) =>
    setData((d) => (d ? { ...d, data: d.data.map((i) => (i.id === updated.id ? { ...i, ...updated } : i)) } : d));

  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const empty =
    view === 'action' && !activeCount
      ? { icon: 'fa-check-circle', title: t('incidents.emptyActionTitle'), hint: t('incidents.emptyActionHint') }
      : view === 'drafts' && !activeCount
        ? { icon: 'fa-pencil-alt', title: t('incidents.emptyDraftsTitle'), hint: t('incidents.emptyDraftsHint') }
        : undefined;

  return (
    <div className="space-y-4">
      {mapBack && (
        <Link id="back-to-map" to={mapBack} className="inline-flex items-center gap-2 text-sm font-medium text-bgb-600 hover:text-bgb-800">
          <i className="fas fa-arrow-left" /> {t('map.backToMap')}
        </Link>
      )}
      {/* Views */}
      {views.length > 1 && (
        <nav className="flex gap-1 overflow-x-auto rounded-md border border-gray-200 bg-white p-1 shadow-sm" aria-label={t('incidents.views')}>
          {views.map((v) => {
            const badge = v.id === 'action' ? counts?.action : v.id === 'drafts' ? counts?.drafts : 0;
            return (
              <button
                key={v.id}
                id={`view-${v.id}`}
                onClick={() => chooseView(v.id)}
                aria-current={view === v.id ? 'page' : undefined}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
                  view === v.id ? 'bg-bgb-700 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100',
                )}
              >
                <i className={`fas ${v.icon} text-xs`} />
                {v.label}
                {badge > 0 && (
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold', view === v.id ? 'bg-white/20 text-white' : v.id === 'action' ? 'bg-amber-100 text-amber-800' : 'bg-gray-200 text-gray-700')}>
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      )}

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
          {view !== 'drafts' && (
            <select id="filter-status" value={filters.status} onChange={set('status')} className="form-input" aria-label={t('common.status')}>
              <option value="">{t('common.allStatus')}</option>
              {(meta?.statuses || []).map((s) => (
                <option key={s} value={s}>
                  {tv('status', s)}
                </option>
              ))}
            </select>
          )}
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
          <select id="filter-sector" value={filters.sector} onChange={(e) => update({ sector: e.target.value, battalion: '', bop: '' })} className="form-input" aria-label={t('common.sector')}>
            <option value="">{t('incidents.allSectors')}</option>
            {Object.keys(hierarchy).map((s) => <option key={s}>{s}</option>)}
          </select>
          <select id="filter-battalion" value={filters.battalion} onChange={(e) => update({ battalion: e.target.value, bop: '' })} disabled={!filters.sector} className="form-input" aria-label={t('common.battalion')}>
            <option value="">{t('incidents.allBattalions')}</option>
            {battalions.map((b) => <option key={b}>{b}</option>)}
          </select>
          <select id="filter-bop" value={filters.bop} onChange={set('bop')} disabled={!filters.battalion} className="form-input" aria-label={t('common.bop')}>
            <option value="">{t('incidents.allBops')}</option>
            {bops.map((b) => <option key={b}>{b}</option>)}
          </select>

          <label className="flex items-center gap-2">
            <span className="w-10 shrink-0 text-xs font-medium text-gray-500">{t('incidents.dateFrom')}</span>
            <input id="filter-date-from" type="date" value={filters.dateFrom} max={filters.dateTo || undefined} onChange={set('dateFrom')} className="form-input min-w-0" />
          </label>
          <label className="flex items-center gap-2">
            <span className="w-10 shrink-0 text-xs font-medium text-gray-500">{t('incidents.dateTo')}</span>
            <input id="filter-date-to" type="date" value={filters.dateTo} min={filters.dateFrom || undefined} onChange={set('dateTo')} className="form-input min-w-0" />
          </label>
          {view !== 'action' && (
            <select id="filter-archived" value={filters.archived} onChange={set('archived')} className="form-input" aria-label={t('incidents.archiveFilter')}>
              <option value="">{t('incidents.activeOnly')}</option>
              <option value="only">{t('incidents.archivedOnly')}</option>
              <option value="include">{t('incidents.allRecords')}</option>
            </select>
          )}
          <select id="filter-overdue" value={filters.overdue} onChange={set('overdue')} className="form-input" aria-label={t('incidents.overdueFilter')}>
            <option value="">{t('incidents.anyWait')}</option>
            <option value="true">{t('incidents.overdueOnly')}</option>
          </select>
          <select id="filter-sort" value={filters.sort || DEFAULT_SORT} onChange={set('sort')} className="form-input" aria-label={t('incidents.sort')}>
            {SORTS.map(([value, key]) => (
              <option key={value} value={value}>
                {t(key)}
              </option>
            ))}
          </select>
          <button onClick={clearFilters} disabled={!activeCount} className="btn btn-secondary">
            <i className="fas fa-times" /> {t('common.clear')}
          </button>
        </div>
      </Card>

      {/* List */}
      <Card
        title={t('incidents.listTitle', { n: total })}
        bodyClassName=""
        actions={
          canCreate && (
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
            <IncidentList incidents={data.data} onChanged={onChanged} empty={empty} />
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
