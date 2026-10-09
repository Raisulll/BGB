import { SEVERITY_HEX, SEVERITY_STYLES, STATUS_STYLES, cn } from '../../utils/helpers';
import { useI18n } from '../../i18n/I18nContext';

export function StatusBadge({ status }) {
  const { tv } = useI18n();
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium',
        STATUS_STYLES[status] || STATUS_STYLES.Draft,
      )}
    >
      {tv('status', status)}
    </span>
  );
}

export function SeverityBadge({ severity }) {
  const { tv } = useI18n();
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium',
        SEVERITY_STYLES[severity] || 'border-slate-300 bg-slate-50 text-slate-700',
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: SEVERITY_HEX[severity] || '#64748b' }} aria-hidden="true" />
      {tv('severity', severity)}
    </span>
  );
}

export function Tag({ children, className = '' }) {
  return (
    <span className={cn('inline-flex items-center whitespace-nowrap rounded bg-navy-50 px-2 py-0.5 text-xs font-medium text-navy-700 sm:text-xs', className)}>
      {children}
    </span>
  );
}

/** Whole days an incident has waited in its current workflow step (0 = less than a day). */
export const daysWaiting = (since) => Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 86_400_000));

/** Shown when the server flags a record overdue (longer than workflow.overdue_days in one step). */
export function OverdueBadge({ since }) {
  const { t } = useI18n();
  const n = Math.max(1, daysWaiting(since));
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800"
      title={t('incidents.overdueTitle', { n })}
    >
      <i className="fas fa-hourglass-end text-xs" />
      {t('incidents.overdueDays', { n })}
    </span>
  );
}
