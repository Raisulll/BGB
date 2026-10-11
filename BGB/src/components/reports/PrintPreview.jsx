import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../i18n/I18nContext';

// Specs #21, #22 — print preview (reports and single incidents): the formal document shown full
// screen, exactly as it will print.
// On paper only the document appears (toolbar and app frame are print:hidden); the A4 page rule with
// "Page x of y" is mounted only while the preview is open.
export default function PrintPreview({ onClose, onPrint, printing, preparing, status, children }) {
  const { t } = useI18n();

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !printing && onClose();
    window.addEventListener('keydown', onKey);
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = 'hidden'; // the preview scrolls, not the page behind it
    return () => {
      window.removeEventListener('keydown', onKey);
      html.style.overflow = prev;
    };
  }, [onClose, printing]);

  // Rendered at the top of <body> so nothing in the app frame can sit above it
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('rep.previewTitle')}
      className="print-preview fixed inset-0 z-50 flex flex-col bg-slate-200 print:static print:block print:bg-white"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-300 bg-white px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-6 print:hidden">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900">{t('rep.previewTitle')}</h2>
          <p className="text-sm text-slate-600">{status || t('rep.previewHint')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onClose} disabled={printing} className="btn btn-secondary">
            {t('common.close')}
          </button>
          <button type="button" onClick={onPrint} disabled={printing || preparing} title={preparing ? t('rep.printWait') : undefined} className="btn btn-primary">
            {(printing || preparing) && <i className="fas fa-spinner fa-spin" aria-hidden="true" />}
            {t('rep.printBtn')}
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-4 sm:px-6 sm:py-8 print:overflow-visible print:p-0">{children}</div>
      {/* A4 pages with "Page x of y" in the bottom margin (Chrome/Edge; Firefox adds its own) */}
      <style>{`@media print { @page { size: A4; margin: 12mm 13mm 14mm; @bottom-center { content: "${t('rep.doc.page')} " counter(page) " ${t('rep.doc.of')} " counter(pages); font-family: "Times New Roman", Times, serif; font-size: 9pt; } } }`}</style>
    </div>,
    document.body,
  );
}
