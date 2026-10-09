import { useEffect } from 'react';

/** Centered dialog (bottom sheet on phones). Escape or a backdrop click closes it unless `busy`. */
export default function Modal({ open, title, icon, onClose, busy = false, children, maxWidth = 'max-w-md' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/60 p-3 backdrop-blur-xs sm:items-center" onClick={() => !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="modal-title" className={`w-full ${maxWidth} max-h-[90vh] overflow-y-auto animate-pop-in rounded-2xl bg-white p-5 shadow-2xl sm:p-6`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between border-b border-gray-100 pb-3">
          <h3 id="modal-title" className="flex items-center gap-2 text-base font-bold text-gray-800">
            {icon && <i className={`fas ${icon} text-bgb-600`} />}
            {title}
          </h3>
          <button type="button" onClick={onClose} disabled={busy} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            <i className="fas fa-times" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Shows a one-time secret (temporary password) with a copy button. */
export function OneTimeSecret({ label, value }) {
  const copy = () => navigator.clipboard?.writeText(value).catch(() => {});
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
      <p className="mb-1 text-xs font-bold text-amber-800">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 break-all rounded bg-white px-2 py-1.5 font-mono text-sm text-gray-900 border border-amber-200">{value}</code>
        <button type="button" onClick={copy} className="btn btn-secondary px-3 text-xs" aria-label="Copy to clipboard">
          <i className="fas fa-copy" />
        </button>
      </div>
      <p className="mt-2 text-[11px] text-amber-700">
        <i className="fas fa-exclamation-triangle mr-1" />
        Shown once. Hand it to the user through a secure channel; they must change it at first sign-in.
      </p>
    </div>
  );
}
