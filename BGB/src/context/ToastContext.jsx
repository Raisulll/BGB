import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';

const ToastContext = createContext(null);

const STYLES = {
  success: { bg: 'bg-emerald-600', icon: 'fa-check-circle' },
  error: { bg: 'bg-red-600', icon: 'fa-times-circle' },
  info: { bg: 'bg-blue-600', icon: 'fa-info-circle' },
  warning: { bg: 'bg-amber-500', icon: 'fa-exclamation-triangle' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const { t: tr } = useI18n();
  const idRef = useRef(0);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const showToast = useCallback(
    (message, type = 'success') => {
      const id = ++idRef.current;
      setToasts((t) => [...t, { id, message, type }]);
      setTimeout(() => dismiss(id), 3000);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-3 top-3 z-[100] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-4 sm:top-4 sm:w-96 print:hidden"
      >
        {toasts.map((t) => {
          const s = STYLES[t.type] || STYLES.info;
          return (
            <div
              key={t.id}
              role="status"
              className={`${s.bg} pointer-events-auto flex animate-slide-in items-center gap-3 rounded-lg px-4 py-3 text-sm text-white shadow-lg`}
            >
              <i className={`fas ${s.icon}`} />
              <span className="flex-1">{t.message}</span>
              <button onClick={() => dismiss(t.id)} className="opacity-70 hover:opacity-100" aria-label={tr('ui.dismiss')}>
                <i className="fas fa-times text-xs" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useToast = () => useContext(ToastContext);
