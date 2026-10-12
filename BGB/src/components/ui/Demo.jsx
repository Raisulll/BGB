import { useToast } from '../../context/ToastContext';
import { useI18n } from '../../i18n/I18nContext';

// Features deferred for the demo version (backups, DR, HA, load testing, log management) are shown
// in the interface so the TEC can see where they live, but they are not functional. Everything
// on such a panel is marked with these components so it is never mistaken for live data.

export function DemoBadge({ className = '' }) {
  const { t } = useI18n();
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded border border-violet-300 bg-violet-50 px-1.5 py-px text-xs font-semibold text-violet-800 ${className}`}
      title={t('demo.badgeTitle')}
    >
      <i className="fas fa-flask text-[10px]" aria-hidden="true" /> {t('demo.badge')}
    </span>
  );
}

/** Marks an illustrative value inside a demo panel. */
export function Sample({ children }) {
  const { t } = useI18n();
  return (
    <span className="rounded border border-dashed border-violet-300 bg-violet-50 px-1.5 py-px font-mono text-xs text-violet-900" title={t('demo.sampleTitle')}>
      {children}
    </span>
  );
}

export function DemoNotice({ children }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
      <i className="fas fa-flask mt-0.5 text-violet-700" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

/** A button that only explains it isn't active in the demo version. */
export function DemoButton({ icon, children, feature, className = 'btn-secondary' }) {
  const { showToast } = useToast();
  const { t } = useI18n();
  return (
    <button type="button" onClick={() => showToast(t('demo.notActive', { feature: feature || children }), 'info')} className={`btn ${className}`}>
      <i className={`fas ${icon}`} /> {children} <DemoBadge />
    </button>
  );
}
