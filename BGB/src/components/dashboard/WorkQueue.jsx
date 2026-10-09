import { Link } from 'react-router-dom';
import * as incidentsApi from '../../api/incidents';
import { useApp } from '../../context/AppContext';
import useApi from '../../hooks/useApi';
import { cn } from '../../utils/helpers';
import { useI18n } from '../../i18n/I18nContext';

// Specs #13, #17 — what is waiting for this user, each tile a link to the matching incident view.
// Counts come from the list API (server applies scope, workflow rules and the overdue setting).
const count = (query, signal) => incidentsApi.list({ ...query, pageSize: 1 }, signal).then((r) => r.total);

export default function WorkQueue({ overdueInScope }) {
  const { meta, hasPermission } = useApp();
  const { t } = useI18n();
  const canCreate = hasPermission(null, 'create');
  const canAct = Boolean(meta?.canAct);

  const { data } = useApi(
    async (signal) => {
      const [action, actionOverdue, returned, drafts] = await Promise.all([
        canAct || canCreate ? count({ needsAction: 'true' }, signal) : null,
        canAct ? count({ needsAction: 'true', overdue: 'true' }, signal) : null,
        canCreate ? count({ createdBy: 'me', status: 'Returned' }, signal) : null,
        canCreate ? count({ createdBy: 'me', status: 'Draft' }, signal) : null,
      ]);
      return { action, actionOverdue, returned, drafts };
    },
    [canAct, canCreate],
  );

  const tiles = [
    data?.action != null && { to: '/incidents?view=action', icon: 'fa-bell', label: t('queue.action'), n: data.action, tone: 'amber' },
    data?.actionOverdue != null && { to: '/incidents?view=action&overdue=true', icon: 'fa-hourglass-end', label: t('queue.actionOverdue'), n: data.actionOverdue, tone: 'red' },
    data?.returned != null && { to: '/incidents?view=mine&status=Returned', icon: 'fa-undo', label: t('queue.returned'), n: data.returned, tone: 'purple' },
    data?.drafts != null && { to: '/incidents?view=drafts', icon: 'fa-pencil-alt', label: t('queue.drafts'), n: data.drafts, tone: 'slate' },
    { to: '/incidents?overdue=true', icon: 'fa-stopwatch', label: t('queue.overdueArea'), n: overdueInScope, tone: 'red' },
  ].filter(Boolean);

  const TONES = {
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    red: 'border-red-200 bg-red-50 text-red-700',
    purple: 'border-purple-200 bg-purple-50 text-purple-700',
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
  };

  return (
    <section className="card p-3 sm:p-4" aria-labelledby="queue-title">
      <h2 id="queue-title" className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800 sm:text-base">
        <i className="fas fa-inbox text-bgb-500" /> {t('queue.title')}
      </h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
        {tiles.map((tile) => (
          <Link
            key={tile.to}
            to={tile.to}
            className={cn(
              'flex items-center gap-3 rounded-xl border p-3 transition-all hover:-translate-y-0.5 hover:shadow-md',
              tile.n ? TONES[tile.tone] : 'border-gray-200 bg-white text-gray-400',
            )}
          >
            <i className={`fas ${tile.icon} text-lg`} />
            <div className="min-w-0">
              <p className="text-xl font-black leading-none">{tile.n ?? '–'}</p>
              <p className="mt-1 text-[11px] font-semibold leading-tight">{tile.label}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
