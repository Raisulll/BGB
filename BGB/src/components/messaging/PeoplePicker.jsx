import { useState } from 'react';
import * as messagingApi from '../../api/messaging';
import useApi, { useDebounced } from '../../hooks/useApi';
import { useI18n } from '../../i18n/I18nContext';
import { cn } from '../../utils/helpers';
import Spinner from '../ui/Spinner';
import Avatar from './Avatar';

/**
 * Searchable list of everyone the user can message (GET /messaging/users).
 * single: onPick(person) on click. multiple: checkboxes bound to `selected` (ids) / onChange.
 * exclude: ids not to offer (existing group members).
 */
export default function PeoplePicker({ multiple = false, selected = [], onChange, onPick, exclude = [], disabled = false }) {
  const { t, tv } = useI18n();
  const [q, setQ] = useState('');
  const query = useDebounced(q.trim(), 250);
  const { data, loading, message } = useApi((signal) => messagingApi.directory(query || undefined, signal), [query]);
  const people = (data || []).filter((p) => !exclude.includes(p.id));

  const toggle = (id) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div>
      <label htmlFor="people-search" className="sr-only">
        {t('msg.searchPeople')}
      </label>
      <div className="relative">
        <i className="fas fa-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" aria-hidden="true" />
        <input
          id="people-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('msg.searchPeople')}
          className="form-input pl-8"
          autoComplete="off"
        />
      </div>
      <div className="mt-2 max-h-72 overflow-y-auto rounded-md border border-slate-200">
        {loading && !data ? (
          <div className="p-6">
            <Spinner />
          </div>
        ) : message ? (
          <p className="p-4 text-sm text-red-700">{message}</p>
        ) : people.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">{t('msg.noPeople')}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {people.map((p) => {
              const checked = selected.includes(p.id);
              const body = (
                <>
                  <Avatar name={p.name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">{p.name}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {tv('role', p.role)} · {p.scope}
                    </span>
                  </span>
                </>
              );
              return (
                <li key={p.id}>
                  {multiple ? (
                    <label className={cn('flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-slate-50', checked && 'bg-bgb-50')}>
                      <input type="checkbox" checked={checked} onChange={() => toggle(p.id)} disabled={disabled} className="h-4 w-4 accent-bgb-700" />
                      {body}
                    </label>
                  ) : (
                    <button type="button" onClick={() => onPick(p)} disabled={disabled} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-50">
                      {body}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
