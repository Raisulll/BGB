import { SEVERITY_STYLES, STATUS_STYLES, cn } from '../../utils/helpers';
import { useI18n } from '../../i18n/I18nContext';

export function StatusBadge({ status }) {
  const { tv } = useI18n();
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
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
        'inline-flex items-center whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-medium sm:text-xs',
        SEVERITY_STYLES[severity] || 'bg-gray-50 text-gray-600',
      )}
    >
      {tv('severity', severity)}
    </span>
  );
}

export function Tag({ children, className = '' }) {
  return (
    <span className={cn('inline-flex items-center whitespace-nowrap rounded bg-navy-50 px-2 py-0.5 text-[11px] font-medium text-navy-700 sm:text-xs', className)}>
      {children}
    </span>
  );
}
