import { Link } from 'react-router-dom';
import * as incidentsApi from '../../api/incidents';
import useApi from '../../hooks/useApi';
import { formatDateDisplay } from '../../utils/helpers';
import { SeverityBadge } from '../ui/Badges';
import Card from '../ui/Card';
import { useI18n } from '../../i18n/I18nContext';

/** Why two incidents are related, in words: "Same BOP · 2 days apart" / "1.1 km away · same day". */
export function matchText(match, t) {
  const where = match.sameBop ? t('related.sameBop') : match.distanceKm != null ? t('related.km', { km: match.distanceKm }) : null;
  const when = match.daysApart === 0 ? t('related.sameDay') : match.daysApart === 1 ? t('related.dayApart') : t('related.daysApart', { n: match.daysApart });
  return [where, when].filter(Boolean).join(' · ');
}

// Specs #8, #16 — incidents at the same BOP or within 5 km, within 30 days either side (server rule)
export default function RelatedIncidents({ incidentId }) {
  const { t } = useI18n();
  const { data, error } = useApi((signal) => incidentsApi.related(incidentId, signal), [incidentId]);

  return (
    <Card title={t('related.title')} icon="fa-project-diagram" bodyClassName="p-0">
      {error ? (
        <p className="p-4 text-xs text-red-600">{t('error.load')}</p>
      ) : !data ? (
        <p className="p-4 text-xs text-gray-400">{t('common.loading')}</p>
      ) : data.length === 0 ? (
        <p className="p-4 text-sm text-gray-400">{t('related.none')}</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {data.map((r) => (
            <li key={r.id}>
              <Link to={`/incidents/${r.id}`} className="block px-4 py-3 transition-colors hover:bg-gray-50">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-bgb-700">{r.id}</span>
                  <SeverityBadge severity={r.severity} />
                </div>
                <p className="mt-0.5 truncate text-sm font-medium text-gray-800">{r.title}</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {formatDateDisplay(r.date)} · {r.category}
                </p>
                <p className="mt-1 text-xs font-semibold text-amber-700">
                  <i className="fas fa-link mr-1" />
                  {matchText(r.match, t)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
