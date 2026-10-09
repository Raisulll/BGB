import { useToast } from '../../context/ToastContext';

// Features deferred for the demo version (backups, DR, HA, load testing, log management) are shown
// in the interface so the TEC can see where they live, but they are not functional. Everything
// on such a panel is marked with these components so it is never mistaken for live data.

export function DemoBadge({ className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border border-violet-300 bg-violet-100 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-violet-800 ${className}`}
      title="Demo version: shown for evaluation, not functional yet"
    >
      <i className="fas fa-flask text-[8px]" /> Demo
    </span>
  );
}

/** Marks an illustrative value inside a demo panel. */
export function Sample({ children }) {
  return (
    <span className="rounded border border-dashed border-violet-300 bg-violet-50/70 px-1.5 py-0.5 font-mono text-[11px] text-violet-900" title="Sample value for the demo">
      {children}
    </span>
  );
}

export function DemoNotice({ children }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50 p-3.5 text-xs text-violet-900">
      <i className="fas fa-flask mt-0.5 text-violet-600" />
      <div>{children}</div>
    </div>
  );
}

/** A button that only explains it isn't active in the demo version. */
export function DemoButton({ icon, children, feature, className = 'btn-secondary' }) {
  const { showToast } = useToast();
  return (
    <button type="button" onClick={() => showToast(`${feature || children}: not active in the demo version.`, 'info')} className={`btn ${className} text-xs`}>
      <i className={`fas ${icon}`} /> {children} <DemoBadge />
    </button>
  );
}
