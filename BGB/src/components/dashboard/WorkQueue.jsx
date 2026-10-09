import { Link } from 'react-router-dom';
import * as incidentsApi from '../../api/incidents';
import { useApp } from '../../context/AppContext';
import useApi from '../../hooks/useApi';
import { cn } from '../../utils/helpers';
import { useI18n } from '../../i18n/I18nContext';

// Specs #13, #17 — what is waiting for this user, each tile a link to the matching incident view.
// Counts come from the list API (server applies scope, workflow rules and the overdue setting).
const count = (query, signal) => incidentsApi.list({ ...query, pageSize: 1 }, signal).then((r) => r.total);

export default function WorkQueue() {
  const { meta, hasPermission } = useApp();
  const { t } = useI18n();
  const canCreate = hasPermission(null, 'create');
  const canAct = Boolean(meta?.canAct);

  const { data } = useApi(
    async (signal) => {
      const [action, actionOverdue, returned, drafts, overdueInScope] = await Promise.all([
        canAct || canCreate ? count({ needsAction: 'true' }, signal) : null,
        canAct ? count({ needsAction: 'true', overdue: 'true' }, signal) : null,
        canCreate ? count({ createdBy: 'me', status: 'Returned' }, signal) : null,
        canCreate ? count({ createdBy: 'me', status: 'Draft' }, signal) : null,
        count({ overdue: 'true' }, signal),
      ]);
      return { action, actionOverdue, returned, drafts, overdueInScope };
    },
    [canAct, canCreate],
  );

  const tiles = [
    data?.action != null && { to: '/incidents?view=action', icon: 'fa-bell', label: t('queue.action'), n: data.action, tone: 'amber' },
    data?.actionOverdue != null && { to: '/incidents?view=action&overdue=true', icon: 'fa-hourglass-end', label: t('queue.actionOverdue'), n: data.actionOverdue, tone: 'red' },
    data?.returned != null && { to: '/incidents?view=mine&status=Returned', icon: 'fa-undo', label: t('queue.returned'), n: data.returned, tone: 'purple' },
    data?.drafts != null && { to: '/incidents?view=drafts', icon: 'fa-pencil-alt', label: t('queue.drafts'), n: data.drafts, tone: 'slate' },
    { to: '/incidents?overdue=true', icon: 'fa-stopwatch', label: t('queue.overdueArea'), n: data?.overdueInScope, tone: 'red' },
  ].filter(Boolean);



  return (
    <section className="card p-4" aria-labelledby="queue-title">
      <h2 id="queue-title" className="mb-3 text-base font-semibold text-slate-900">
        {t('queue.title')}
      </h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
        {tiles.map((tile) => (
          <Link
            key={tile.to}
            to={tile.to}
            className="block rounded-md border border-slate-200 p-3 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bgb-700"
          >
            <p className={cn('text-2xl font-semibold tabular-nums', tile.tone === 'red' && tile.n > 0 ? 'text-red-700' : 'text-slate-900')}>{tile.n ?? '–'}</p>
            <p className="mt-0.5 text-sm text-slate-600">{tile.label}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
