import { Link, useLocation } from 'react-router-dom';
import { useAlerts } from '../../context/AlertsContext';
import { formatDateTime } from '../../utils/helpers';
import { useI18n } from '../../i18n/I18nContext';
import { useAlertArea } from './AlertBits';

const SHOWN = 2;

/** A red strip on every page while Flash Alerts are active for this user (acknowledged or not). */
export default function AlertBanner() {
  const { active } = useAlerts();
  const { t } = useI18n();
  const area = useAlertArea();
  const { pathname } = useLocation();
  if (active.length === 0) return null;
  const more = active.length - SHOWN;

  return (
    <div className="border-b border-red-800 bg-red-700 text-white print:hidden" role="region" aria-label={t('alerts.activeRegion')}>
      {active.slice(0, SHOWN).map((a) => (
        <div key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-red-600/60 px-3 py-2 text-sm last:border-b-0 sm:px-4">
          <i className="fas fa-triangle-exclamation" aria-hidden="true" />
          <span className="font-semibold uppercase tracking-wide">{t('alerts.flashAlert')}</span>
          <span className="font-mono text-xs text-red-100">{a.reference}</span>
          <span className="min-w-0 flex-1 truncate font-medium">{a.title}</span>
          <span className="hidden text-xs text-red-100 md:inline">
            {area(a)} · {t('alerts.untilShort', { time: formatDateTime(a.validUntil) })}
          </span>
          {pathname !== `/alerts/${a.id}` && (
            <Link to={`/alerts/${a.id}`} className="rounded border border-white/70 px-2.5 py-1 text-xs font-medium hover:bg-red-800">
              {t('alerts.view')}
            </Link>
          )}
        </div>
      ))}
      {more > 0 && (
        <Link to="/alerts" className="block px-3 py-1.5 text-xs font-medium text-red-100 hover:bg-red-800 sm:px-4">
          {t('alerts.moreActive', { n: more })}
        </Link>
      )}
    </div>
  );
}
