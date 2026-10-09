import { formatDateTime } from '../../utils/helpers';
import { useI18n } from '../../i18n/I18nContext';

// Specs #13, #14 — why a report was returned or rejected, shown where the filer sees it first
// (incident page and the edit form) instead of only inside the timeline.
const STYLE = {
  Returned: { box: 'border-amber-300 bg-amber-50 text-amber-900', icon: 'fa-undo text-amber-600', title: 'detail.returnedBanner' },
  Rejected: { box: 'border-red-300 bg-red-50 text-red-900', icon: 'fa-ban text-red-600', title: 'detail.rejectedBanner' },
};

export default function ReasonBanner({ incident, className = '' }) {
  const { t } = useI18n();
  const style = STYLE[incident.status];
  if (!style) return null;
  // The latest Returned/Rejected step is the one that put the record in its current status
  const step = [...(incident.timeline || [])].reverse().find((e) => e.action === incident.status);
  if (!step) return null;
  return (
    <div className={`flex items-start gap-3 rounded-md border-l-4 border p-3 sm:p-4 ${style.box} ${className}`} role="note">
      <i className={`fas ${style.icon} mt-0.5`} />
      <div className="min-w-0">
        <p className="text-sm font-bold">{t(style.title, { user: step.user, date: formatDateTime(step.date) })}</p>
        {step.notes ? (
          <p className="mt-1 whitespace-pre-line text-sm">{step.notes}</p>
        ) : (
          <p className="mt-1 text-sm italic opacity-75">{t('detail.noReason')}</p>
        )}
        {incident.status === 'Returned' && incident.canEdit && <p className="mt-2 text-xs font-medium opacity-80">{t('detail.returnedNext')}</p>}
      </div>
    </div>
  );
}
