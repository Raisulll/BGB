import { Link } from 'react-router-dom';
import Card from '../ui/Card';
import StatCard from '../ui/StatCard';
import { SeverityBadge, StatusBadge } from '../ui/Badges';
import { formatDateDisplay } from '../../utils/helpers';
import { useI18n } from '../../i18n/I18nContext';

// Specs #17, #19, #21 — the generated report as an in-app overview (figures, breakdowns and the
// incident list). Printing uses the formal document instead (PrintPreview → OfficialReport).
const pct = (n, total) => (total ? `${((n / total) * 100).toFixed(1)}%` : '—');

function Share({ n, total }) {
  const p = total ? (n / total) * 100 : 0;
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="tabular-nums text-slate-700">{pct(n, total)}</span>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
        <span className="block h-full bg-bgb-700" style={{ width: `${p}%` }} />
      </span>
    </div>
  );
}

export default function ReportOverview({ report }) {
  const { t, tv } = useI18n();
  const s = report.summary;
  const total = s.total;
  const categories = report.byCategory.filter((c) => c.count > 0);
  const highCritical = (s.bySeverity.High || 0) + (s.bySeverity.Critical || 0);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-6">
        <StatCard label={t('rep.ov.total')} value={total} />
        <StatCard label={t('rep.ov.highCritical')} value={highCritical} alert />
        <StatCard label={t('rep.ov.pending')} value={s.pendingReview} />
        <StatCard label={t('rep.ov.returned')} value={s.returned} />
        <StatCard label={t('rep.ov.resolved')} value={s.approved + s.closed} />
        <StatCard label={t('rep.ov.overdue')} value={s.overdue} alert />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
        <Card title={t('rep.doc.s.category')} icon="fa-chart-pie" bodyClassName="p-0">
          {categories.length ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="th">{t('common.category')}</th>
                    <th className="th text-right">{t('common.count')}</th>
                    <th className="th text-right">{t('rep.doc.highCritical')}</th>
                    <th className="th text-right">{t('common.proportion')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {categories.map((c) => (
                    <tr key={c.category}>
                      <td className="td font-medium text-slate-900">{c.category}</td>
                      <td className="td text-right tabular-nums">{c.count}</td>
                      <td className="td text-right tabular-nums">{c.highSeverity}</td>
                      <td className="td">
                        <Share n={c.count} total={total} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-4 text-sm text-slate-600">{t('rep.doc.none')}</p>
          )}
        </Card>

        <Card title={t('rep.doc.s.sector')} icon="fa-building" bodyClassName="p-0">
          {report.bySector.length ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="th">{t('common.sector')}</th>
                    {['Low', 'Medium', 'High', 'Critical'].map((sev) => (
                      <th key={sev} className="th text-right">{tv('severity', sev)}</th>
                    ))}
                    <th className="th text-right">{t('common.count')}</th>
                    <th className="th text-right">{t('rep.doc.riskScore')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.bySector.map((r) => (
                    <tr key={r.sector}>
                      <td className="td font-medium text-slate-900">{r.sector}</td>
                      {['Low', 'Medium', 'High', 'Critical'].map((sev) => (
                        <td key={sev} className="td text-right tabular-nums">{r.bySeverity[sev] || 0}</td>
                      ))}
                      <td className="td text-right tabular-nums">{r.total}</td>
                      <td className="td text-right tabular-nums">{r.riskScore}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-4 text-sm text-slate-600">{t('rep.doc.none')}</p>
          )}
        </Card>
      </div>

      <Card
        title={t('rep.ov.register', { n: total })}
        icon="fa-list"
        actions={report.meta.truncated ? <span className="text-sm text-amber-800">{t('rep.doc.truncated', { n: report.incidents.length, total })}</span> : null}
        bodyClassName="p-0"
      >
        {report.incidents.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem]">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="th">{t('common.reference')}</th>
                  <th className="th">{t('common.title')}</th>
                  <th className="th">{t('rep.bnBop')}</th>
                  <th className="th">{t('common.category')}</th>
                  <th className="th">{t('common.severity')}</th>
                  <th className="th">{t('common.status')}</th>
                  <th className="th">{t('common.date')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.incidents.map((i) => (
                  <tr key={i.id} className="hover:bg-slate-50">
                    <td className="td whitespace-nowrap">
                      <Link to={`/incidents/${i.id}`} className="font-medium text-bgb-700 hover:underline">
                        {i.id}
                      </Link>
                    </td>
                    <td className="td max-w-xs truncate text-slate-900" title={i.title}>{i.title}</td>
                    <td className="td text-slate-600">{[i.battalion, i.bop].filter(Boolean).join(' / ')}</td>
                    <td className="td text-slate-600">{i.category}</td>
                    <td className="td"><SeverityBadge severity={i.severity} /></td>
                    <td className="td"><StatusBadge status={i.status} /></td>
                    <td className="td whitespace-nowrap tabular-nums text-slate-700">{formatDateDisplay(i.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-4 text-sm text-slate-600">{t('rep.doc.none')}</p>
        )}
      </Card>
    </div>
  );
}
