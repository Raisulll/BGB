import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from '../components/ui/Modal';
import { useI18n } from '../i18n/I18nContext';

/**
 * Warns before unsaved form input is lost. Closing or reloading the tab gets the browser's own
 * prompt; clicking an in-app link (sidebar, header, Cancel) opens a dialog instead. The app uses
 * <BrowserRouter>, where React Router's useBlocker isn't available, so links are intercepted here.
 * The browser Back button is not covered. Returns the dialog element to render.
 */
export default function useUnsavedChanges(dirty) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [pending, setPending] = useState(null); // where the user wanted to go

  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    // Capture phase on document runs before React's handlers on the root, so the Link never navigates
    const onClick = (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      setPending(url.pathname + url.search + url.hash);
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty]);

  return (
    <Modal open={Boolean(pending)} title={t('form.unsavedTitle')} icon="fa-exclamation-triangle" onClose={() => setPending(null)}>
      <p className="text-sm text-gray-600">{t('form.unsavedText')}</p>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={() => setPending(null)} className="btn btn-secondary">
          {t('form.unsavedStay')}
        </button>
        <button
          type="button"
          onClick={() => {
            const to = pending;
            setPending(null);
            navigate(to);
          }}
          className="btn bg-red-600 text-white hover:bg-red-700"
        >
          <i className="fas fa-sign-out-alt" /> {t('form.unsavedLeave')}
        </button>
      </div>
    </Modal>
  );
}
