import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Line } from 'react-chartjs-2';
import { axisOptions } from '../lib/chart';
import { useApp } from '../context/AppContext';
import * as reportsApi from '../api/reports';
import * as incidentsApi from '../api/incidents';
import useApi from '../hooks/useApi';
import useMediaQuery from '../hooks/useMediaQuery';
import { cn, formatDateDisplay, todayISO } from '../utils/helpers';
import Card from '../components/ui/Card';
import ErrorState from '../components/ui/ErrorState';
import Spinner from '../components/ui/Spinner';
import StatCard from '../components/ui/StatCard';
import IncidentList from '../components/incidents/IncidentList';
import DashboardCategoryCard from '../components/dashboard/DashboardCategoryCard';
import WorkQueue from '../components/dashboard/WorkQueue';
import { useI18n } from '../i18n/I18nContext';

const monthLabel = (period, t) => {
  const [y, m] = period.split('-');
  return `${t(`month.${Number(m)}`)} ${y.slice(2)}`;
};

// Period presets for the dashboard figures (incident date). "all" = no date filter, 12-month trend.
const DAY = 86_400_000;
const shiftISO = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const PRESETS = ['all', '7', '30', '90', 'year', 'custom'];
function periodRange(preset, custom) {
  const today = todayISO();
  if (preset === 'all') return {};
  if (preset === 'year') return { dateFrom: `${today.slice(0, 4)}-01-01`, dateTo: today };
  if (preset === 'custom') return { dateFrom: custom.from || undefined, dateTo: custom.to || undefined };
  return { dateFrom: shiftISO(today, 1 - Number(preset)), dateTo: today };
}
// Trend buckets that suit the span: days up to a month, weeks up to half a year, then months
function granularityFor({ dateFrom, dateTo }) {
  if (!dateFrom) return 'month';
  const days = (Date.parse(dateTo || todayISO()) - Date.parse(dateFrom)) / DAY + 1;
  return days <= 31 ? 'day' : days <= 183 ? 'week' : 'month';
}

// Spec #17 — role-based dashboard. Every figure comes from the server and is limited to the
// signed-in user's scope; drafts are excluded from statistics.
async function loadDashboard(canList, range) {
  const granularity = granularityFor(range);
  const [summary, trends, resolved, categories, sectors, recent] = await Promise.all([
    reportsApi.summary(range),
    reportsApi.trends({ granularity, ...range }),
    reportsApi.trends({ granularity, status: 'Approved,Closed', ...range }),
    reportsApi.byCategory(range),
    reportsApi.bySector(range),
    canList ? incidentsApi.list({ pageSize: 5, sort: 'createdAt', order: 'desc', ...range }) : null,
  ]);
  return { summary, trends, resolved, categories, sectors, recent: recent?.data || [], granularity };
}

export default function Dashboard() {
  const { currentUser, hasPermission } = useApp();
  const { t, tv } = useI18n();
  const isNarrow = useMediaQuery('(max-width: 639px)');
  const fontSize = isNarrow ? 10 : 12;
  const canList = hasPermission(null, 'incidents');
  const [preset, setPreset] = useState('all');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const range = useMemo(() => periodRange(preset, custom), [preset, custom]);
  const { data, error, message, reload, loading } = useApi(() => loadDashboard(canList, range), [canList, range]);
  const bucketLabel = (p) => (data?.granularity === 'month' ? monthLabel(p.period, t) : formatDateDisplay(p.start).slice(0, 5));

  const monthlyTrendData = useMemo(() => {
    if (!data) return null;
    const series = data.trends.series;
    const resolvedBy = new Map(data.resolved.series.map((p) => [p.period, p.count]));
    const last = series[series.length - 1];
    return {
      labels: series.map(bucketLabel),
      currentMonthLabel: last ? bucketLabel(last) : '',
      currentTotal: last?.count ?? 0,
      datasets: [
        {
          label: t('dash.seriesTotal'),
          data: series.map((p) => p.count),
          borderColor: '#1e5e1e',
          backgroundColor: 'rgba(30, 94, 30, 0.1)',
          fill: true,
          tension: 0.35,
          borderWidth: 2.5,
          pointBackgroundColor: '#1e5e1e',
          pointRadius: 3.5,
        },
        {
          label: t('dash.seriesHigh'),
          data: series.map((p) => p.bySeverity.High + p.bySeverity.Critical),
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.05)',
          borderDash: [5, 5],
          fill: false,
          tension: 0.35,
          borderWidth: 2,
          pointBackgroundColor: '#ef4444',
          pointRadius: 3,
        },
        {
          label: t('dash.seriesResolved'),
          data: series.map((p) => resolvedBy.get(p.period) ?? 0),
          borderColor: '#3b82f6',
          backgroundColor: 'transparent',
          fill: false,
          tension: 0.35,
          borderWidth: 2,
          pointBackgroundColor: '#3b82f6',
          pointRadius: 3,
        },
      ],
    };
  }, [data, t]); // bucketLabel derives from data and t

  if (error) return <Card><ErrorState message={message} onRetry={reload} /></Card>;
  if (!data) return <Spinner />;

  const { summary } = data;
  const stats = {
    total: summary.total,
    open: summary.open,
    pending: summary.pendingReview,
    verified: summary.verified,
    closed: summary.approved + summary.closed,
    critical: summary.bySeverity.High + summary.bySeverity.Critical,
  };
  const sectorSummary = data.sectors.map((s) => ({
    name: s.sector,
    count: s.total,
    critical: s.bySeverity.High + s.bySeverity.Critical,
    riskScore: s.riskScore,
  }));

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Who and where, and the main actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-900">{t('dash.welcome', { name: currentUser.name, role: tv('role', currentUser.role) })}</p>
          <p className="text-xs text-slate-600">
            {formatDateDisplay(new Date())} · {t('dash.scope', { scope: currentUser.scope })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasPermission(null, 'create') && (
            <Link to="/incidents/new" className="btn btn-primary">
              <i className="fas fa-plus" aria-hidden="true" /> {t('dash.report')}
            </Link>
          )}
          {hasPermission(null, 'map') && (
            <Link to="/map" className="btn btn-secondary">
              {t('dash.map')}
            </Link>
          )}
          {hasPermission(null, 'reports') && (
            <Link to="/reports" className="btn btn-secondary">
              {t('dash.reports')}
            </Link>
          )}
        </div>
      </div>

      {/* What is waiting for this user (current work: not limited by the period below) */}
      <WorkQueue />

      {/* Period for the figures below */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1 rounded-md border border-slate-300 bg-white p-1" role="group" aria-label={t('dash.period')}>
          {PRESETS.map((p) => (
            <button
              key={p}
              id={`period-${p}`}
              type="button"
              onClick={() => setPreset(p)}
              aria-pressed={preset === p}
              className={cn('rounded px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bgb-700', preset === p ? 'bg-bgb-700 text-white' : 'text-slate-700 hover:bg-slate-100')}
            >
              {t(`dash.period_${p}`)}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="flex flex-wrap items-center gap-2">
            <input id="period-from" type="date" value={custom.from} max={custom.to || todayISO()} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="form-input w-auto" aria-label={t('incidents.dateFrom')} />
            <span className="text-xs text-gray-500">–</span>
            <input id="period-to" type="date" value={custom.to} min={custom.from || undefined} max={todayISO()} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="form-input w-auto" aria-label={t('incidents.dateTo')} />
          </div>
        )}
        {loading && <i className="fas fa-spinner fa-spin text-bgb-500" aria-hidden="true" />}
      </div>

      {/* Primary KPI Summary Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6">
        <StatCard label={t('dash.kpiTotal')} value={stats.total} />
        <StatCard label={t('dash.kpiOpen')} value={stats.open} />
        <StatCard label={t('dash.kpiPending')} value={stats.pending} />
        {/* Spec #17 — verified incidents */}
        <StatCard label={t('dash.kpiVerified')} value={stats.verified} note={t('dash.kpiVerifiedNote')} />
        <StatCard label={t('dash.kpiClosed')} value={stats.closed} />
        <StatCard label={t('dash.kpiCritical')} value={stats.critical} alert />
      </div>

      {/* Analytics Visualization Cards */}
      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
        <DashboardCategoryCard categories={data.categories} />

        <Card
          title={t('dash.trendTitle')}
          icon="fa-chart-line"
          actions={
            <p className="text-xs text-slate-600">
              {range.dateFrom ? t('dash.rangeWindow', { from: formatDateDisplay(range.dateFrom), to: formatDateDisplay(range.dateTo || todayISO()) }) : t('dash.window')}
              {' · '}
              {t('dash.current', { month: monthlyTrendData.currentMonthLabel, n: monthlyTrendData.currentTotal })}
            </p>
          }
        >
          <div className="h-64 sm:h-72">
            <Line
              data={monthlyTrendData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: 'top',
                    labels: { boxWidth: 12, padding: 10, font: { size: fontSize, weight: '600' } },
                  },
                  tooltip: {
                    mode: 'index',
                    intersect: false,
                    padding: 10,
                    cornerRadius: 8,
                  },
                },
                scales: axisOptions(fontSize),
              }}
            />
          </div>
        </Card>
      </div>

      {/* Sector Intelligence & Quick Operational Overview */}
      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <Card title={t('dash.sectorTitle')} icon="fa-shield-alt">
            <div className="space-y-3">
              {sectorSummary.length === 0 && <p className="text-sm text-gray-400">{t('dash.noSector')}</p>}
              {sectorSummary.map((sec) => {
                const totalInc = stats.total || 1;
                const pct = Math.round((sec.count / totalInc) * 100);
                return (
                  <div key={sec.name} className="border-b border-slate-200 pb-3 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-900">{sec.name}</span>
                      <span className="tabular-nums text-slate-700">{t('dash.sectorCount', { n: sec.count })}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-slate-600">
                      <span>
                        {t('dash.riskScore')}: <span className="tabular-nums text-slate-800">{sec.riskScore}</span>
                      </span>
                      <span className={sec.critical > 0 ? 'font-medium text-red-700' : 'text-slate-600'}>
                        {sec.critical > 0 ? t('dash.highThreats', { n: sec.critical }) : t('dash.normal')}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-bgb-700" style={{ width: `${Math.min(100, Math.max(4, pct))}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {canList && (
        <div className="lg:col-span-2">
          <Card
            title={t('dash.recent')}
            icon="fa-list-alt"
            bodyClassName=""
            actions={
              <Link to="/incidents" className="text-sm font-medium text-bgb-700 underline-offset-2 hover:underline">
                {t('dash.viewAll')}
              </Link>
            }
          >
            <IncidentList incidents={data.recent} compact />
          </Card>
        </div>
        )}
      </div>
    </div>
  );
}

