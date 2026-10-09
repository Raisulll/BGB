import { SEVERITY_STYLES, STATUS_STYLES, cn } from '../../utils/helpers';

export function StatusBadge({ status }) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
        STATUS_STYLES[status] || STATUS_STYLES.Draft,
      )}
    >
      {status}
    </span>
  );
}

export function SeverityBadge({ severity }) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-medium sm:text-xs',
        SEVERITY_STYLES[severity] || 'bg-gray-50 text-gray-600',
      )}
    >
      {severity}
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
