import { useI18n } from '../../i18n/I18nContext';

export default function EmptyState({ icon = 'fa-inbox', title, children }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center px-4 py-10 text-center text-gray-400 sm:py-14">
      <i className={`fas ${icon} mb-3 text-3xl sm:text-4xl`} />
      <p className="text-sm font-medium text-gray-500">{title || t('ui.nothingHere')}</p>
      {children && <div className="mt-1 text-xs">{children}</div>}
    </div>
  );
}
