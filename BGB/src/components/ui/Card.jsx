import { cn } from '../../utils/helpers';

/** White rounded panel with optional header (title, icon, right-side actions). */
export default function Card({ id, title, icon, actions, children, className = '', bodyClassName = '', as: Tag = 'section' }) {
  const hasHeader = title || actions;
  const bodyPadding = /\bp-\d+\b|\bpx-\d+\b|\bpy-\d+\b/.test(bodyClassName) ? '' : 'p-4 sm:p-5';

  return (
    <Tag id={id} className={cn('card', className)}>
      {hasHeader && (
        <header className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          {title && (
            <h3 className="flex items-center text-base font-semibold text-slate-900">
              {icon && <i className={`fas ${icon} mr-2 text-sm text-slate-500`} aria-hidden="true" />}
              {title}
            </h3>
          )}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn(bodyPadding, bodyClassName)}>{children}</div>
    </Tag>
  );
}
