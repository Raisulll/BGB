import { cn } from '../../utils/helpers';
import { useI18n } from '../../i18n/I18nContext';

// Flash Alert labels. Red marks an alert that is live (CLAUDE.md §9: red only for severity and alerts).
const STATE_STYLES = {
  active: 'border-red-300 bg-red-50 text-red-800',
  expired: 'border-slate-300 bg-slate-50 text-slate-700',
  resolved: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  cancelled: 'border-slate-300 bg-slate-100 text-slate-700',
};

export function AlertStateBadge({ state }) {
  const { tv } = useI18n();
  return <span className={cn('inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium', STATE_STYLES[state])}>{tv('alertState', state)}</span>;
}

export function AlertPriorityBadge({ priority }) {
  const { tv } = useI18n();
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide',
        priority === 'flash' ? 'border-red-700 bg-red-700 text-white' : 'border-amber-300 bg-amber-50 text-amber-900',
      )}
    >
      {tv('alertPriority', priority)}
    </span>
  );
}

/** "Sector-7, Sector-11" or "All units" */
export function useAlertArea() {
  const { t } = useI18n();
  return (alert) => (alert.targetSectors.length ? alert.targetSectors.join(', ') : t('alerts.allUnits'));
}
