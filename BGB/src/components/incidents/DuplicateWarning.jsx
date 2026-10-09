import { Link } from 'react-router-dom';
import * as incidentsApi from '../../api/incidents';
import useApi, { useDebounced } from '../../hooks/useApi';
import { formatDateDisplay } from '../../utils/helpers';
import { StatusBadge } from '../ui/Badges';
import { matchText } from './RelatedIncidents';
import { useI18n } from '../../i18n/I18nContext';

// Possible duplicates while filing: reports within a day of this one, within 1 km or at the same
// BOP in the same category (server rule, GET /incidents/similar). Advisory only: filing is never
// blocked, the officer decides. Links open in this tab; the form's unsaved-changes guard applies.
const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? undefined : Number(v));

export default function DuplicateWarning({ form, excludeId }) {
  const { t } = useI18n();
  const lat = num(form.lat);
  const lng = num(form.lng);
  const gps = lat !== undefined && lng !== undefined; // coordinates only count as a pair
  const ready = /^\d{4}-\d{2}-\d{2}$/.test(form.date || '') && (gps || form.bop);
  const query = useDebounced(
    ready ? JSON.stringify({ date: form.date, lat: gps ? lat : undefined, lng: gps ? lng : undefined, bop: form.bop || undefined, category: form.category || undefined, excludeId }) : '',
    600,
  );
  const { data } = useApi((signal) => (query ? incidentsApi.similar(JSON.parse(query), signal) : Promise.resolve([])), [query]);

  if (!data?.length) return null;
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 sm:p-4" role="status" aria-live="polite">
      <p className="flex items-center gap-2 text-sm font-bold text-amber-900">
        <i className="fas fa-clone text-amber-600" />
        {t('dup.title', { n: data.length })}
      </p>
      <p className="mt-1 text-xs text-amber-800">{t('dup.hint')}</p>
      <ul className="mt-2 space-y-1.5">
        {data.map((r) => (
          <li key={r.id}>
            <Link to={`/incidents/${r.id}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-white/70 px-2.5 py-1.5 text-xs hover:bg-white">
              <span className="font-mono font-semibold text-bgb-700">{r.id}</span>
              <span className="min-w-0 flex-1 truncate font-medium text-gray-800">{r.title}</span>
              <span className="text-gray-500">{formatDateDisplay(r.date)}</span>
              <StatusBadge status={r.status} />
              <span className="w-full text-xs font-semibold text-amber-700">{matchText(r.match, t)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
