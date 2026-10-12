import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bar, Line } from 'react-chartjs-2';
import { axisOptions } from '../lib/chart';
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
// filed incidents (drafts excluded) within the signed-in user's scope. Every chart opens the
// matching incidents in the incidents list (spec #16).

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
const GREEN = '#166534'; // bgb-800
const SLATE = '#94a3b8'; // slate-400
const RED = SEVERITY_HEX.Critical;

function rangeStart(range) {
  const [y, m, d] = todayISO().split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (range.days) dt.setUTCDate(dt.getUTCDate() - range.days + 1);
  else dt.setUTCMonth(dt.getUTCMonth() - range.months + 1, 1);
  return dt.toISOString().slice(0, 10);
}

/** Same dates one year earlier, for the year-on-year comparison */
const minusYear = (iso) => `${Number(iso.slice(0, 4)) - 1}${iso.slice(4)}`;

/** The day before an ISO date (end of a trend period = next period's start − 1 day) */
function dayBefore(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function riskLabel(ratio) {
  if (ratio >= 0.6) return { text: 'an.risk.critical', cls: 'bg-red-50 text-red-800 border-red-200' };
  if (ratio >= 0.4) return { text: 'an.risk.high', cls: 'bg-orange-50 text-orange-800 border-orange-200' };
  if (ratio >= 0.2) return { text: 'an.risk.moderate', cls: 'bg-amber-50 text-amber-800 border-amber-200' };
  return { text: 'an.risk.normal', cls: 'bg-bgb-50 text-bgb-800 border-bgb-200' };
}

async function loadAnalytics(filters, granularity) {
  const [summary, trends, previous, severity, categories, sectors, hotspots, timing] = await Promise.all([
    reportsApi.summary(filters),
    reportsApi.trends({ ...filters, granularity }),
    reportsApi.trends({ ...filters, granularity, dateFrom: minusYear(filters.dateFrom), dateTo: minusYear(todayISO()) }),
    reportsApi.bySeverity(filters),
    reportsApi.byCategory(filters),
    reportsApi.bySector(filters),
    reportsApi.byLocation({ ...filters, limit: 8 }),
    reportsApi.byTime(filters),
  ]);
  return { summary, trends, previous, severity, categories, sectors, hotspots, timing };
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

/** Chart.js options that open the incidents behind a clicked bar or point */
function clickable(onPick) {
  return {
    onClick: (_e, elements) => elements.length && onPick(elements[0].index, elements[0].datasetIndex),
    onHover: (e, elements) => {
      if (e.native?.target) e.native.target.style.cursor = elements.length ? 'pointer' : 'default';
    },
  };
}

export default function Analytics() {
  const { meta, hasPermission } = useApp();
  const { showToast } = useToast();
  const { lang, t, tv } = useI18n();
  const navigate = useNavigate();
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

  /** The incidents list with this page's period and units plus `extra` (archived included, as in the figures) */
  const listUrl = (extra = {}) => {
    const p = new URLSearchParams({ archived: 'include', dateFrom: filters.dateFrom, dateTo: data?.trends.to || todayISO() });
    if (sector) p.set('sector', sector);
    if (battalion) p.set('battalion', battalion);
    for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
    return `/incidents?${p}`;
  };
  const open = (extra) => navigate(listUrl(extra));

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
    const line = (color, extra) => ({ borderColor: color, backgroundColor: color, borderWidth: 2, pointRadius: cur.length > 40 ? 0 : 3, pointHoverRadius: 5, tension: 0.25, ...extra });
    return {
      labels: cur.map((p) => p.period),
      datasets: [
        { label: t('an.incidents'), data: cur.map((p) => p.count), ...line(GREEN, { fill: { target: 'origin', above: 'rgba(22, 101, 52, 0.08)' } }) },
        { label: t('an.highCritical'), data: cur.map((p) => p.bySeverity.High + p.bySeverity.Critical), ...line(RED) },
        { label: t('an.prevYear'), data: cur.map((_, i) => prev[i]?.count ?? 0), ...line(SLATE, { borderDash: [6, 4], pointRadius: 0 }) },
      ],
    };
  }, [data, t]);

  // Weekday names in the interface language, Monday first (2024-01-01 was a Monday)
  const weekdayNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', { weekday: 'short', timeZone: 'UTC' });
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(Date.UTC(2024, 0, 1 + i))));
  }, [lang]);

  if (error) return <Card><ErrorState message={message} onRetry={reload} /></Card>;
  if (!data) return <Spinner />;

  const { summary, timing } = data;
  const critical = summary.bySeverity.High + summary.bySeverity.Critical;
  const resolved = summary.approved + summary.closed;
  const resolutionRate = summary.total ? Math.round((resolved / summary.total) * 100) : 0;
  const series = data.trends.series;
  const last = series[series.length - 1]?.count ?? 0;
  const before = series[series.length - 2]?.count;
  const change = before ? Math.round(((last - before) / before) * 100) : null;
  const categories = data.categories.filter((c) => c.count > 0);
  const busiestHour = timing.hours.reduce((a, b) => (b.count > a.count ? b : a), timing.hours[0]);
  const nightCount = timing.hours.filter((h) => h.hour >= 18 || h.hour < 6).reduce((n, h) => n + h.count, 0);
  const hh = (h) => `${String(h).padStart(2, '0')}:00`;

  const stackedHigh = (rows, labels) => ({
    labels,
    datasets: [
      { label: t('an.highCritical'), data: rows.map((r) => r.highSeverity), backgroundColor: RED, stack: 's' },
      { label: t('an.otherSeverity'), data: rows.map((r) => r.count - r.highSeverity), backgroundColor: SLATE, stack: 's' },
    ],
  });
  const stackedScales = { x: { ...axisOptions(fontSize).x, stacked: true }, y: { ...axisOptions(fontSize).y, stacked: true } };
  const smallLegend = { position: 'bottom', labels: { boxWidth: 10, font: { size: fontSize } } };

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
          {summary.overdue > 0 && (
            <Link to={listUrl({ overdue: 'true' })} className="mt-1 inline-block text-xs font-semibold text-red-700 hover:underline">
              {t('an.overdueLink', { n: summary.overdue })}
            </Link>
          )}
        </Kpi>
      </div>

      {/* Trend */}
      <Card title={t('an.trendTitle', { gran: t(`an.gran.${granularity}`), from: formatDateDisplay(data.trends.from), to: formatDateDisplay(data.trends.to) })} icon="fa-chart-line">
        <div className="h-72 pt-2 sm:h-80">
          <Line
            data={trendData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              interaction: { mode: 'index', intersect: false },
              plugins: { legend: { position: 'top', labels: { font: { size: fontSize, weight: '600' }, usePointStyle: true, pointStyle: 'line', boxWidth: 24 } }, tooltip: { mode: 'index', intersect: false } },
              scales: axisOptions(fontSize),
              // The clicked period's incidents (previous-year line excluded: other dates)
              ...clickable((i) => {
                const p = series[i];
                open({ dateFrom: p.start, dateTo: series[i + 1] ? dayBefore(series[i + 1].start) : data.trends.to });
              }),
            }}
          />
        </div>
        <p className="mt-2 text-xs text-slate-500">{t('an.clickTrend')}</p>
      </Card>

      {/* Breakdowns */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title={t('an.severityTitle')} icon="fa-exclamation-triangle">
          <div className="h-64 pt-2">
            <Bar
              data={{
                labels: data.severity.map((s) => tv('severity', s.severity)),
                datasets: [{ label: t('an.incidents'), data: data.severity.map((s) => s.count), backgroundColor: data.severity.map((s) => SEVERITY_HEX[s.severity]), borderRadius: 4 }],
              }}
              options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: axisOptions(fontSize), ...clickable((i) => open({ severity: data.severity[i].severity })) }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">{t('an.clickBar')}</p>
        </Card>

        <Card title={t('an.categoryTitle')} icon="fa-tags">
          <div className="h-64 pt-2">
            {/* Sorted bars instead of a pie: categories compare at a glance and labels stay readable */}
            <Bar
              data={{
                labels: categories.map((c) => c.category),
                datasets: [
                  { label: t('an.highCritical'), data: categories.map((c) => c.highSeverity), backgroundColor: RED, stack: 's' },
                  { label: t('an.otherSeverity'), data: categories.map((c) => c.count - c.highSeverity), backgroundColor: SLATE, stack: 's' },
                ],
              }}
              options={{
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: smallLegend, tooltip: { mode: 'index', intersect: false, footer: (items) => t('an.totalN', { n: categories[items[0].dataIndex].count }) } },
                scales: stackedScales,
                ...clickable((i) => open({ category: categories[i].category })),
              }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">{t('an.clickBar')}</p>
        </Card>

        <Card title={t('an.sectorRisk')} icon="fa-building">
          <div className="h-64 pt-2">
            <Bar
              data={{
                labels: data.sectors.map((s) => s.sector),
                datasets: SEVERITIES.map((sev) => ({ label: tv('severity', sev), data: data.sectors.map((s) => s.bySeverity[sev] || 0), backgroundColor: SEVERITY_HEX[sev] })),
              }}
              options={{
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: smallLegend },
                scales: stackedScales,
                ...clickable((i, ds) => open({ sector: data.sectors[i].sector, battalion: '', severity: SEVERITIES[ds] })),
              }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">{t('an.clickBar')}</p>
        </Card>
      </div>

      {/* When incidents happen + hotspots */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title={t('an.timeTitle')} icon="fa-clock">
          {summary.total === 0 ? (
            <p className="p-6 text-center text-sm text-gray-400">{t('an.noPeriod')}</p>
          ) : (
            <>
              <p className="text-sm text-slate-700">
                {t('an.timeSummary', { hour: hh(busiestHour.hour), to: hh((busiestHour.hour + 1) % 24), night: Math.round((nightCount / summary.total) * 100) })}
              </p>
              <div className="mt-3 h-48">
                <Bar
                  data={stackedHigh(timing.hours, timing.hours.map((h) => String(h.hour).padStart(2, '0')))}
                  options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: smallLegend, tooltip: { mode: 'index', intersect: false, callbacks: { title: (items) => `${hh(items[0].dataIndex)}–${hh((items[0].dataIndex + 1) % 24)}` } } }, scales: stackedScales }}
                />
              </div>
              <h4 className="mt-4 text-xs font-semibold text-slate-600">{t('an.byWeekday')}</h4>
              <div className="mt-1 h-40">
                <Bar data={stackedHigh(timing.weekdays, weekdayNames)} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } }, scales: stackedScales }} />
              </div>
              <p className="mt-2 text-xs text-slate-500">{t('an.timeNote')}</p>
            </>
          )}
        </Card>

        <Card title={t('an.hotspotsTitle')} icon="fa-location-dot" bodyClassName="">
          {data.hotspots.length === 0 ? (
            <p className="p-6 text-center text-sm text-gray-400">{t('an.noPeriod')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="th">{t('common.bop')}</th>
                    <th className="th text-right">{t('an.thTotal')}</th>
                    <th className="th text-right">{t('an.highCritical')}</th>
                    <th className="th hidden sm:table-cell">{t('an.thLast')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-slate-700">
                  {data.hotspots.map((h) => (
                    <tr key={`${h.sector}|${h.battalion}|${h.bop}`}>
                      <td className="px-3 py-2.5">
                        {/* The BOP's incidents in the list, with this page's period */}
                        <Link to={listUrl({ sector: h.sector, battalion: h.battalion, bop: h.bop })} className="font-semibold text-bgb-800 hover:underline" title={t('an.viewIncidents')}>
                          {h.bop}
                        </Link>
                        <p className="whitespace-nowrap text-xs text-slate-500">{[h.battalion, h.sector].filter(Boolean).join(' · ')}</p>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{h.total}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        <span className={h.highSeverity ? 'font-semibold text-red-700' : ''}>{h.highSeverity}</span>
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-2.5 sm:table-cell">{formatDateDisplay(h.lastDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-4 py-3 text-xs text-slate-500">{t('an.hotspotsNote')}</p>
            </div>
          )}
        </Card>
      </div>

      {/* Sector risk table */}
      <Card title={t('an.riskSummary')} icon="fa-shield-alt" bodyClassName="">
        {data.sectors.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-400">{t('an.noPeriod')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="th">{t('common.sector')}</th>
                  <th className="th">{t('an.thTotal')}</th>
                  <th className="th">{t('an.thRatio')}</th>
                  <th className="th">{t('an.thScore')}</th>
                  <th className="th text-right">{t('an.thAssessment')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
                {data.sectors.map((s) => {
                  const high = (s.bySeverity.High || 0) + (s.bySeverity.Critical || 0);
                  const ratio = s.total ? high / s.total : 0;
                  const risk = riskLabel(ratio);
                  return (
                    <tr key={s.sector}>
                      <td className="px-4 py-3 font-semibold text-gray-900">
                        <Link to={listUrl({ sector: s.sector, battalion: '' })} className="hover:underline">{s.sector}</Link>
                      </td>
                      <td className="px-4 py-3 font-semibold tabular-nums">{s.total}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-md border px-2 py-0.5 font-semibold ${risk.cls}`}>{(ratio * 100).toFixed(1)}%</span>
                      </td>
                      <td className="px-4 py-3 tabular-nums">{s.riskScore}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${risk.cls}`}>{t(risk.text)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="px-4 py-3 text-xs text-slate-500">{t('an.riskNote')}</p>
          </div>
        )}
      </Card>
    </div>
  );
}
