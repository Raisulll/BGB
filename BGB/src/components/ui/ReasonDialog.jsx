import { useEffect, useRef, useState } from 'react';

/**
 * Modal that asks for a written reason before an action (return / reject an incident, remove
 * evidence). The reason is stored in the incident timeline and the audit log (specs #12, #24).
 */
export default function ReasonDialog({ open, title, label = 'Reason', confirmLabel = 'Confirm', confirmClass = 'btn-primary', required = true, busy = false, onConfirm, onCancel }) {
  const [reason, setReason] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    setReason('');
    setTimeout(() => ref.current?.focus(), 0);
    const onKey = (e) => e.key === 'Escape' && !busy && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;
  const trimmed = reason.trim();

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/60 p-3 backdrop-blur-xs sm:items-center" onClick={() => !busy && onCancel()}>
      <div role="dialog" aria-modal="true" aria-labelledby="reason-dialog-title" className="w-full max-w-md animate-pop-in rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 id="reason-dialog-title" className="mb-3 text-base font-bold text-gray-800">
          {title}
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (required && !trimmed) return;
            onConfirm(trimmed);
          }}
        >
          <label htmlFor="reason-dialog-text" className="form-label">
            {label}
            {required && <span className="text-red-500"> *</span>}
          </label>
          <textarea id="reason-dialog-text" ref={ref} rows={4} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} className="form-input" />
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={onCancel} disabled={busy} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={busy || (required && !trimmed)} className={`btn ${confirmClass}`}>
              {busy && <i className="fas fa-spinner fa-spin" />} {confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
