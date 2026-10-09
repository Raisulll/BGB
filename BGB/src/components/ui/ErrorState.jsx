import { useI18n } from '../../i18n/I18nContext';

/** Shown when an API request for a page section fails; offers a retry. */
export default function ErrorState({ message, onRetry }) {
  const { t } = useI18n();
  return (
    <div role="alert" className="flex flex-col items-center justify-center px-4 py-10 text-center sm:py-14">
      <i className="fas fa-exclamation-triangle mb-3 text-3xl text-amber-500" />
      <p className="text-sm font-medium text-gray-700">{message || t('error.load')}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn btn-secondary mt-3">
          <i className="fas fa-redo" /> {t('common.retry')}
        </button>
      )}
    </div>
  );
}
