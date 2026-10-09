import { useMemo, useState } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import { axisOptions, legendPosition, PALETTE } from '../lib/chart';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import * as reportsApi from '../api/reports';
import { errorMessage } from '../api/client';
import useApi from '../hooks/useApi';
import useMediaQuery from '../hooks/useMediaQuery';
import { formatDateDisplay, SEVERITY_HEX, todayISO } from '../utils/helpers';
import Card from '../components/ui/Card';
import ErrorState from '../components/ui/ErrorState';
import Spinner from '../components/ui/Spinner';
import { useI18n } from '../i18n/I18nContext';

// Specs #19, #20 — analytics and trend analysis. All figures are computed by the server over
// filed incidents (drafts excluded) within the signed-in user's scope.

const RANGES = [
  { id: '30d', days: 30, granularity: 'day' },
  { id: '6m', months: 6, granularity: 'week' },
  { id: '12m', months: 12, granularity: 'month' },
  { id: '3y', months: 36, granularity: 'quarter' },
];
const GRANULARITIES = [
  { id: 'day' },
  { id: 'week' },
  { id: 'month' },
  { id: 'quarter' },
  { id: 'year' },
];
const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];

function rangeStart(range) {
  const [y, m, d] = todayISO().split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (range.days) dt.setUTCDate(dt.getUTCDate() - range.days + 1);
  else dt.setUTCMonth(dt.getUTCMonth() - range.months + 1, 1);
  return dt.toISOString().slice(0, 10);
}

/** Same dates one year earlier, for the year-on-year comparison */
const minusYear = (iso) => `${Number(iso.slice(0, 4)) - 1}${iso.slice(4)}`;

function riskLabel(ratio) {
  if (ratio >= 0.6) return { text: 'an.risk.critical', cls: 'bg-red-50 text-red-700 border-red-200/80' };
  if (ratio >= 0.4) return { text: 'an.risk.high', cls: 'bg-orange-50 text-orange-700 border-orange-200/80' };
  if (ratio >= 0.2) return { text: 'an.risk.moderate', cls: 'bg-amber-50 text-amber-700 border-amber-200/80' };
  return { text: 'an.risk.normal', cls: 'bg-bgb-50 text-bgb-700 border-bgb-200/80' };
}

async function loadAnalytics(filters, granularity) {
  const [summary, trends, previous, severity, categories, sectors] = await Promise.all([
    reportsApi.summary(filters),
    reportsApi.trends({ ...filters, granularity }),
    reportsApi.trends({ ...filters, granularity, dateFrom: minusYear(filters.dateFrom), dateTo: minusYear(todayISO()) }),
    reportsApi.bySeverity(filters),
    reportsApi.byCategory(filters),
    reportsApi.bySector(filters),
  ]);
  return { summary, trends, previous, severity, categories, sectors };
}

// Same card style as the dashboard: neutral surface; the secondary figure is plain text
function Kpi({ title, value, badge, children }) {
  return (
    <div className="card p-4 sm:p-5">
      <p className="text-sm text-slate-600">{title}</p>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className="text-3xl font-semibold tabular-nums text-slate-900">{value}</span>
        {badge && <span className="text-sm text-slate-600">{badge}</span>}
      </div>
      {children}
    </div>
  );
}

export default function Analytics() {
  const { meta, hasPermission } = useApp();
  const { showToast } = useToast();
  const { t, tv } = useI18n();
  const isNarrow = useMediaQuery('(max-width: 639px)');
  const fontSize = isNarrow ? 10 : 12;

  const [rangeId, setRangeId] = useState('12m');
  const [granularity, setGranularity] = useState('month');
  const [sector, setSector] = useState('');
  const [battalion, setBattalion] = useState('');
  const [exporting, setExporting] = useState(false);

  const range = RANGES.find((r) => r.id === rangeId);
  // No dateTo: the server extends the range to the latest incident date
  const filters = useMemo(() => ({ dateFrom: rangeStart(range), sector, battalion }), [range, sector, battalion]);
  const { data, error, message, reload, loading } = useApi(() => loadAnalytics(filters, granularity), [filters, granularity]);

  const hierarchy = meta?.hierarchy || {};
  const battalions = Object.keys(hierarchy[sector] || {});
  const gNoun = t(`an.noun.${granularity}`);

  const chosenRange = (r) => {
    setRangeId(r.id);
    setGranularity(r.granularity);
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      const name = await reportsApi.exportReport('excel', { ...filters, type: 'statistical' });
      showToast(t('common.downloaded', { name }), 'success');
    } catch (err) {
      showToast(errorMessage(err), 'error');
    } finally {
      setExporting(false);
    }
  };

  const trendData = useMemo(() => {
    if (!data) return null;
    const cur = data.trends.series;
    const prev = data.previous.series;
    return {
      labels: cur.map((p) => p.period),
      datasets: [
        { label: t('an.prevYear'), data: cur.map((_, i) => prev[i]?.count ?? 0), backgroundColor: 'rgba(59, 130, 246, 0.45)', borderRadius: 6 },
        { label: t('an.incidents'), data: cur.map((p) => p.count), backgroundColor: 'rgba(22, 101, 52, 0.85)', borderRadius: 6 },
        { label: t('an.highCritical'), data: cur.map((p) => p.bySeverity.High + p.bySeverity.Critical), backgroundColor: 'rgba(239, 68, 68, 0.8)', borderRadius: 6 },
      ],
    };
  }, [data, t]);

  if (error) return <Card><ErrorState message={message} onRetry={reload} /></Card>;
  if (!data) return <Spinner />;

  const { summary } = data;
  const critical = summary.bySeverity.High + summary.bySeverity.Critical;
  const resolved = summary.approved + summary.closed;
  const resolutionRate = summary.total ? Math.round((resolved / summary.total) * 100) : 0;
  const series = data.trends.series;
  const last = series[series.length - 1]?.count ?? 0;
  const before = series[series.length - 2]?.count;
  const change = before ? Math.round(((last - before) / before) * 100) : null;
  const categories = data.categories.filter((c) => c.count > 0);

  return (
    <div className={`space-y-6 ${loading ? 'opacity-70 transition-opacity' : 'transition-opacity'}`}>
      {/* Filters and export */}
      <div className="card flex flex-wrap items-center gap-2.5 p-3 sm:p-4">
        <select value={sector} onChange={(e) => { setSector(e.target.value); setBattalion(''); }} className="form-input w-auto" aria-label={t('common.sector')}>
          <option value="">{t('common.allSectors')}</option>
          {Object.keys(hierarchy).map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={battalion} onChange={(e) => setBattalion(e.target.value)} disabled={!sector} className="form-input w-auto" aria-label={t('common.battalion')}>
          <option value="">{t('common.allBattalions')}</option>
          {battalions.map((b) => <option key={b}>{b}</option>)}
        </select>
        <div className="flex rounded-md border border-slate-300 bg-white p-1" role="group" aria-label={t('an.range.label')}>
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => chosenRange(r)}
              aria-pressed={rangeId === r.id}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bgb-700 ${rangeId === r.id ? 'bg-bgb-700 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
            >
              {t(`an.range.${r.id}`)}
            </button>
          ))}
        </div>
        <select value={granularity} onChange={(e) => setGranularity(e.target.value)} className="form-input w-auto" aria-label={t('an.granularity')}>
          {GRANULARITIES.map((g) => (
            // The server caps a trend at 750 periods
            <option key={g.id} value={g.id} disabled={g.id === 'day' && range.months > 24}>
              {t(`an.gran.${g.id}`)}
            </option>
          ))}
        </select>
        {hasPermission(null, 'reports') && (
          <button type="button" onClick={exportExcel} disabled={exporting} className="btn btn-secondary sm:ml-auto">
            {exporting && <i className="fas fa-spinner fa-spin" aria-hidden="true" />}
            {t('an.exportExcel')}
          </button>
        )}
      </div>

      {/* KPI Stat Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
        <Kpi title={t('an.kpiTotal')} value={summary.total} badge={change === null ? null : t('an.vsPrev', { sign: change >= 0 ? '+' : '', n: change, unit: gNoun })}>
          <p className="mt-1 text-xs text-slate-600">{t('an.kpiTotalHint')}</p>
        </Kpi>
        <Kpi title={t('an.kpiHigh')} value={critical} badge={t('an.ofTotal', { n: Math.round((critical / (summary.total || 1)) * 100) })}>
          <p className="mt-1 text-xs text-slate-600">{t('an.stillOpen', { n: summary.highSeverityOpen })}</p>
        </Kpi>
        <Kpi title={t('an.kpiResolution')} value={`${resolutionRate}%`} badge={t('an.approvedClosed', { n: resolved })}>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-bgb-700" style={{ width: `${resolutionRate}%` }} />
          </div>
        </Kpi>
        <Kpi title={t('an.kpiPending')} value={summary.pendingReview} badge={summary.returned ? t('an.returned', { n: summary.returned }) : null}>
          <p className="mt-1 text-xs text-slate-600">{t('an.kpiPendingHint')}</p>
        </Kpi>
      </div>

      {/* Trend */}
      <Card title={t('an.trendTitle', { gran: t(`an.gran.${granularity}`), from: formatDateDisplay(data.trends.from), to: formatDateDisplay(data.trends.to) })} icon="fa-chart-bar">
        <div className="h-72 pt-2 sm:h-80">
          <Bar
            data={trendData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { position: 'top', labels: { font: { size: fontSize, weight: '600' }, boxWidth: 14 } }, tooltip: { mode: 'index', intersect: false } },
              scales: axisOptions(fontSize),
            }}
          />
        </div>
      </Card>

      {/* Secondary Charts Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title={t('an.severityTitle')} icon="fa-exclamation-triangle">
          <div className="h-64 pt-2">
            <Bar
              data={{
                labels: data.severity.map((s) => tv('severity', s.severity)),
                datasets: [{ label: t('an.incidents'), data: data.severity.map((s) => s.count), backgroundColor: data.severity.map((s) => SEVERITY_HEX[s.severity]), borderRadius: 8 }],
              }}
              options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: axisOptions(fontSize) }}
            />
          </div>
        </Card>

        <Card title={t('an.sectorRisk')} icon="fa-building">
          <div className="h-64 pt-2">
            <Bar
              data={{
                labels: data.sectors.map((s) => s.sector),
                datasets: SEVERITIES.map((sev) => ({ label: tv('severity', sev), data: data.sectors.map((s) => s.bySeverity[sev] || 0), backgroundColor: SEVERITY_HEX[sev], borderRadius: 4 })),
              }}
              options={{
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: fontSize } } } },
                scales: { x: { ...axisOptions(fontSize).x, stacked: true }, y: { ...axisOptions(fontSize).y, stacked: true } },
              }}
            />
          </div>
        </Card>

        <Card title={t('an.categoryTitle')} icon="fa-chart-pie">
          <div className="h-64 pt-2">
            <Doughnut
              data={{
                labels: categories.map((c) => c.category),
                datasets: [{ data: categories.map((c) => c.count), backgroundColor: PALETTE, borderWidth: 2, borderColor: '#ffffff' }],
              }}
              options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: legendPosition(isNarrow), labels: { boxWidth: 12, padding: 8, font: { size: fontSize } } } } }}
            />
          </div>
        </Card>
      </div>

      {/* Sector risk table */}
      <Card title={t('an.riskSummary')} icon="fa-shield-alt" bodyClassName="">
        {data.sectors.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-400">{t('an.noPeriod')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">{t('common.sector')}</th>
                  <th className="px-4 py-3">{t('an.thTotal')}</th>
                  <th className="px-4 py-3">{t('an.thRatio')}</th>
                  <th className="px-4 py-3">{t('an.thScore')}</th>
                  <th className="px-4 py-3 text-right">{t('an.thAssessment')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
                {data.sectors.map((s) => {
                  const high = (s.bySeverity.High || 0) + (s.bySeverity.Critical || 0);
                  const ratio = s.total ? high / s.total : 0;
                  const risk = riskLabel(ratio);
                  return (
                    <tr key={s.sector} className="transition-colors hover:bg-gray-50/80">
                      <td className="px-4 py-3 font-bold text-gray-900">{s.sector}</td>
                      <td className="px-4 py-3 font-bold">{s.total}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-md border px-2 py-0.5 font-bold ${risk.cls}`}>{(ratio * 100).toFixed(1)}%</span>
                      </td>
                      <td className="px-4 py-3 font-mono" title={t('an.scoreHint')}>{s.riskScore}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${risk.cls}`}>{t(risk.text)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
