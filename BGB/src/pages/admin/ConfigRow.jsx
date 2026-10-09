import { useState } from 'react';
import Toggle from '../../components/ui/Toggle';
import { DemoBadge } from '../../components/ui/Demo';
import { useI18n } from '../../i18n/I18nContext';

/** One editable system_config value; label and hint come from `set.key.<key>` / `set.hint.<key>`.
 * `item.demo` adds the DEMO badge (setting is stored, feature not active). */
export default function ConfigRow({ item, row, onSave, busy }) {
  const { t } = useI18n();
  const label = t(`set.key.${row.key}`);
  const [draft, setDraft] = useState(String(row.value));
  const isBool = row.type === 'bool';

  const commit = () => {
    const n = Number(draft);
    if (draft.trim() === '' || !Number.isInteger(n)) return setDraft(String(row.value));
    if (n === row.value) return;
    onSave(row.key, n, () => setDraft(String(row.value)));
  };

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200/90 bg-gray-50/60 p-3.5 transition-all hover:border-bgb-300 hover:bg-white">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-bgb-200/60 bg-bgb-50 text-bgb-700">
          <i className={`fas ${item.icon} text-sm`} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-gray-800">
            {label}
            {item.pending && <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">{t('set.jobPending')}</span>}
            {item.demo && <DemoBadge className="ml-1.5" />}
          </p>
          <p className="text-[11px] text-gray-500">
            {t(`set.hint.${row.key}`)}
            {!isBool && row.min !== undefined && ` ${t('set.range', { min: row.min, max: row.max })}`}
          </p>
        </div>
      </div>
      <div className={busy === row.key ? 'opacity-50' : ''}>
        {isBool ? (
          <Toggle label={label} checked={row.value} onChange={(v) => !busy && onSave(row.key, v)} />
        ) : (
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
            className="form-input w-24 shrink-0 text-center text-xs font-semibold"
          />
        )}
      </div>
    </div>
  );
}
