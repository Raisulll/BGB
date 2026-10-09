import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Doughnut } from 'react-chartjs-2';
import { legendPosition, PALETTE } from '../../lib/chart';
import useMediaQuery from '../../hooks/useMediaQuery';
import Card from '../ui/Card';

const CATEGORY_META = {
  'Smuggling': { icon: 'fa-box-open', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
  'Illegal Crossing': { icon: 'fa-walking', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
  'Arms & Ammunition': { icon: 'fa-crosshairs', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
  'Human Trafficking': { icon: 'fa-users', color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' },
  'Border Infrastructure': { icon: 'fa-tools', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  'Security Threat': { icon: 'fa-shield-alt', color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-200' },
  'Other': { icon: 'fa-folder', color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200' },
};

// `categories` is GET /reports/by-category: [{ category, count, highSeverity, subcategories: [{ name, count }] }]
export default function DashboardCategoryCard({ categories = [] }) {
  const [viewMode, setViewMode] = useState('chart'); // 'chart' | 'list'
  const [activeCategory, setActiveCategory] = useState(null);
  const isNarrow = useMediaQuery('(max-width: 639px)');
  const navigate = useNavigate();
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
      title="Incidents by Category"
      icon="fa-chart-pie"
      actions={
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-semibold">
          <button
            onClick={() => { setViewMode('chart'); setActiveCategory(null); }}
            className={`rounded-md px-2 py-0.5 transition-all ${
              viewMode === 'chart' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <i className="fas fa-chart-pie mr-1 text-[10px]" /> Chart
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`rounded-md px-2 py-0.5 transition-all ${
              viewMode === 'list' ? 'bg-white font-bold text-emerald-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <i className="fas fa-list-ul mr-1 text-[10px]" /> Breakdown
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
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 shadow-xs animate-fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-slate-900">{activeCategory} Breakdown:</span>
                  <span className="text-[11px] text-slate-600">
                    {categoryStats.map[activeCategory].count} incidents
                  </span>
                </div>
                <button
                  onClick={() => navigate(`/incidents?category=${encodeURIComponent(activeCategory)}`)}
                  className="text-[11px] font-bold text-emerald-700 hover:underline flex items-center gap-1"
                >
                  View Directory <i className="fas fa-arrow-right text-[9px]" />
                </button>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                {Object.entries(categoryStats.map[activeCategory].subcategories).map(([sub, cnt]) => (
                  <div key={sub} className="flex items-center justify-between rounded-lg bg-white px-2.5 py-1 border border-slate-200/80">
                    <span className="truncate text-slate-700 font-medium text-[11px]">{sub}</span>
                    <span className="font-bold text-slate-900 text-[11px]">{cnt}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* List & Progress Breakdown View */
        <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1 scrollbar-none">
          {categoryStats.list.map((cat) => {
            const meta = CATEGORY_META[cat.name] || CATEGORY_META['Other'];
            const isExpanded = activeCategory === cat.name;

            return (
              <div
                key={cat.name}
                className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 transition-all hover:border-slate-200"
              >
                <div
                  onClick={() => setActiveCategory(isExpanded ? null : cat.name)}
                  className="flex cursor-pointer items-center justify-between"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-xs ${meta.bg} ${meta.color} ${meta.border}`}>
                      <i className={`fas ${meta.icon}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-xs font-bold text-slate-900">{cat.name}</p>
                        {cat.criticalCount > 0 && (
                          <span className="rounded bg-red-100 px-1.5 py-0.2 text-[9px] font-bold text-red-700">
                            {cat.criticalCount} Urgent
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-200">
                          <div className="h-full rounded-full transition-all duration-300" style={{ width: `${cat.percentage}%`, backgroundColor: cat.color }} />
                        </div>
                        <span className="text-[10px] font-medium text-slate-500">{cat.percentage}%</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-right">
                    <span className="text-xs font-black text-slate-900">{cat.count}</span>
                    <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'} text-[10px] text-slate-400`} />
                  </div>
                </div>

                {/* Subcategory Details when row expanded */}
                {isExpanded && (
                  <div className="mt-2.5 border-t border-slate-200/80 pt-2 space-y-1.5 animate-fade-in">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <span>Subcategories</span>
                      <button
                        onClick={() => navigate(`/incidents?category=${encodeURIComponent(cat.name)}`)}
                        className="text-emerald-700 hover:underline capitalize"
                      >
                        Filter list &rarr;
                      </button>
                    </div>
                    {Object.entries(cat.subcategories).map(([sub, count]) => {
                      const subPct = Math.round((count / cat.count) * 100);
                      return (
                        <div key={sub} className="flex items-center justify-between text-xs rounded-lg bg-white px-2.5 py-1 border border-slate-100">
                          <span className="text-slate-700 font-medium">{sub}</span>
                          <span className="font-bold text-slate-900">{count} <span className="text-[10px] text-slate-400 font-normal">({subPct}%)</span></span>
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
