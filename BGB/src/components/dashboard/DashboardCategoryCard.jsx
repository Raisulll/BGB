import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Doughnut } from 'react-chartjs-2';
import { legendPosition, PALETTE } from '../../lib/chart';
import useMediaQuery from '../../hooks/useMediaQuery';
import Card from '../ui/Card';
import { useI18n } from '../../i18n/I18nContext';

// `categories` is GET /reports/by-category: [{ category, count, highSeverity, subcategories: [{ name, count }] }]
export default function DashboardCategoryCard({ categories = [] }) {
  const [viewMode, setViewMode] = useState('chart'); // 'chart' | 'list'
  const [activeCategory, setActiveCategory] = useState(null);
  const isNarrow = useMediaQuery('(max-width: 639px)');
  const navigate = useNavigate();
  const { t } = useI18n();
  const fontSize = isNarrow ? 10 : 12;

  const categoryStats = useMemo(() => {
    const total = categories.reduce((n, c) => n + c.count, 0);
    const list = categories
      .filter((c) => c.count > 0)
      .map((c, idx) => ({
        name: c.category,
        count: c.count,
        criticalCount: c.highSeverity,
        subcategories: Object.fromEntries(c.subcategories.map((sc) => [sc.name, sc.count])),
        percentage: Math.round((c.count / (total || 1)) * 100),
        color: PALETTE[idx % PALETTE.length],
      }));
    return { total, list, map: Object.fromEntries(list.map((c) => [c.name, c])) };
  }, [categories]);

  const doughnutData = {
    labels: categoryStats.list.map((c) => c.name),
    datasets: [
      {
        data: categoryStats.list.map((c) => c.count),
        backgroundColor: categoryStats.list.map((c) => c.color),
        borderWidth: 2,
        borderColor: '#ffffff',
      },
    ],
  };

  const doughnutOptions = {
    cutout: '64%',
    responsive: true,
    maintainAspectRatio: false,
    onClick: (e, elements) => {
      if (elements && elements.length > 0) {
        const index = elements[0].index;
        const catName = categoryStats.list[index]?.name;
        if (catName) {
          setActiveCategory((prev) => (prev === catName ? null : catName));
        }
      }
    },
    plugins: {
      legend: {
        position: legendPosition(isNarrow),
        labels: { boxWidth: 10, padding: 8, font: { size: fontSize, weight: '600' } },
      },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${ctx.label}: ${ctx.raw} (${Math.round((ctx.raw / (categoryStats.total || 1)) * 100)}%)`,
        },
      },
    },
  };

  return (
    <Card
      title={t('dash.catTitle')}
      icon="fa-chart-pie"
      actions={
        <div className="flex items-center gap-1 rounded-md border border-slate-300 bg-white p-0.5 text-xs font-medium" role="group" aria-label={t('dash.catTitle')}>
          <button
            onClick={() => { setViewMode('chart'); setActiveCategory(null); }}
            aria-pressed={viewMode === 'chart'}
            className={`rounded px-2.5 py-1 transition-colors ${viewMode === 'chart' ? 'bg-bgb-700 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
          >
            {t('dash.chart')}
          </button>
          <button
            onClick={() => setViewMode('list')}
            aria-pressed={viewMode === 'list'}
            className={`rounded px-2.5 py-1 transition-colors ${viewMode === 'list' ? 'bg-bgb-700 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
          >
            {t('dash.breakdown')}
          </button>
        </div>
      }
    >
      {viewMode === 'chart' ? (
        <div className="relative">
          <div className="h-64 sm:h-72">
            <Doughnut data={doughnutData} options={doughnutOptions} />
          </div>

          {/* Subcategory callout popover if category slice clicked */}
          {activeCategory && categoryStats.map[activeCategory] && (
            <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">{t('dash.catBreakdown', { name: activeCategory })}</span>
                  <span className="text-xs text-slate-600">
                    {t('dash.nIncidents', { n: categoryStats.map[activeCategory].count })}
                  </span>
                </div>
                <button
                  onClick={() => navigate(`/incidents?category=${encodeURIComponent(activeCategory)}`)}
                  className="text-xs font-medium text-bgb-700 underline-offset-2 hover:underline"
                >
                  {t('dash.viewDirectory')}
                </button>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                {Object.entries(categoryStats.map[activeCategory].subcategories).map(([sub, cnt]) => (
                  <div key={sub} className="flex items-center justify-between rounded border border-slate-200 bg-white px-2.5 py-1">
                    <span className="truncate text-slate-700">{sub}</span>
                    <span className="font-semibold tabular-nums text-slate-900">{cnt}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* List & Progress Breakdown View */
        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {categoryStats.list.map((cat) => {
            const isExpanded = activeCategory === cat.name;

            return (
              <div
                key={cat.name}
                className="rounded-md border border-slate-200 p-2.5"
              >
                <div
                  onClick={() => setActiveCategory(isExpanded ? null : cat.name)}
                  className="flex cursor-pointer items-center justify-between"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm font-medium text-slate-900">{cat.name}</p>
                        {cat.criticalCount > 0 && (
                          <span className="rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-800">
                            {t('dash.urgent', { n: cat.criticalCount })}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-200">
                          <div className="h-full rounded-full transition-all duration-300" style={{ width: `${cat.percentage}%`, backgroundColor: cat.color }} />
                        </div>
                        <span className="text-xs text-slate-600">{cat.percentage}%</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-right">
                    <span className="text-sm font-semibold tabular-nums text-slate-900">{cat.count}</span>
                    <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'} text-xs text-slate-500`} aria-hidden="true" />
                  </div>
                </div>

                {/* Subcategory Details when row expanded */}
                {isExpanded && (
                  <div className="mt-2.5 space-y-1.5 border-t border-slate-200 pt-2">
                    <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                      <span>{t('dash.subcategories')}</span>
                      <button
                        onClick={() => navigate(`/incidents?category=${encodeURIComponent(cat.name)}`)}
                        className="text-bgb-700 underline-offset-2 hover:underline"
                      >
                        {t('dash.filterList')}
                      </button>
                    </div>
                    {Object.entries(cat.subcategories).map(([sub, count]) => {
                      const subPct = Math.round((count / cat.count) * 100);
                      return (
                        <div key={sub} className="flex items-center justify-between rounded border border-slate-200 bg-white px-2.5 py-1 text-xs">
                          <span className="text-slate-700">{sub}</span>
                          <span className="font-semibold tabular-nums text-slate-900">
                            {count} <span className="font-normal text-slate-600">({subPct}%)</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
