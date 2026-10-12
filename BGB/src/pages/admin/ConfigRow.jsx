import { useState } from 'react';
import Toggle from '../../components/ui/Toggle';
import { DemoBadge } from '../../components/ui/Demo';
import { useI18n } from '../../i18n/I18nContext';

/** Unit shown after a number field, from the key's name (`set.unit.<unit>`) */
function unitOf(key) {
  if (key.endsWith('_minutes')) return 'minutes';
  if (key.endsWith('_days')) return 'days';
  if (key.endsWith('_hours')) return 'hours';
  if (key.endsWith('max_attempts')) return 'attempts';
  if (key.endsWith('min_length')) return 'chars';
  return null;
}

/** One editable system_config value; label and hint come from `set.key.<key>` / `set.hint.<key>`.
 * `item.demo` adds the DEMO badge (setting is stored, feature not active). */
export default function ConfigRow({ item, row, onSave, busy }) {
  const { t } = useI18n();
  const label = t(`set.key.${row.key}`);
  const [draft, setDraft] = useState(String(row.value));
  const isBool = row.type === 'bool';
  const unit = unitOf(row.key);

  const commit = () => {
    const n = Number(draft);
    if (draft.trim() === '' || !Number.isInteger(n)) return setDraft(String(row.value));
    if (n === row.value) return;
    onSave(row.key, n, () => setDraft(String(row.value)));
  };

  return (
    // Switches stay beside their label on phones; number fields go below it
    <div className={`flex gap-3 border-b border-slate-200 py-4 last:border-0 sm:items-center sm:justify-between sm:gap-6 ${isBool ? 'items-center justify-between' : 'flex-col sm:flex-row'}`}>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-slate-900">
          {label}
          {item.pending && <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800">{t('set.jobPending')}</span>}
          {item.demo && <DemoBadge />}
        </p>
        <p className="mt-0.5 text-xs text-slate-600">
          {t(`set.hint.${row.key}`)}
          {!isBool && row.min !== undefined && <span className="whitespace-nowrap"> · {t('set.range', { min: row.min, max: row.max })}</span>}
        </p>
      </div>
      {/* Fixed-width control column so fields and switches line up down the section */}
      <div className={`flex shrink-0 items-center gap-2 sm:w-48 sm:justify-end ${busy === row.key ? 'opacity-50' : ''}`}>
        {isBool ? (
          <Toggle label={label} checked={row.value} onChange={(v) => !busy && onSave(row.key, v)} />
        ) : (
          <>
            <input
              type="number"
              min={row.min}
              max={row.max}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              disabled={Boolean(busy)}
              aria-label={label}
              className="form-input w-24 text-right text-sm tabular-nums"
            />
            <span className="w-20 text-sm text-slate-600">{unit ? t(`set.unit.${unit}`) : ''}</span>
          </>
        )}
      </div>
    </div>
  );
}
