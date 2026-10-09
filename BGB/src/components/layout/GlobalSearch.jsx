import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as incidentsApi from '../../api/incidents';
import useApi, { useDebounced } from '../../hooks/useApi';
import { StatusBadge } from '../ui/Badges';
import { cn } from '../../utils/helpers';
import { useI18n } from '../../i18n/I18nContext';

// Spec #15 — find an incident by reference number (or title) from any page. Suggestions come from
// the incidents list API (scope and draft rules apply). Enter opens the highlighted suggestion, a
// reference number, or the full search on the Incidents page. "/" focuses the box.
const REF = /^(?:BIRDS-)?(\d{4})-(\d{4,})$/i;
const SHORT_REF = /^\d{4}$/;

function referenceFor(text) {
  const m = REF.exec(text);
  if (m) return `BIRDS-${m[1]}-${m[2]}`;
  if (SHORT_REF.test(text)) return `BIRDS-${new Date().getFullYear()}-${text}`;
  return null;
}

export default function GlobalSearch() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const q = useDebounced(text.trim(), 250);

  const { data } = useApi((signal) => (q.length >= 2 ? incidentsApi.list({ q, pageSize: 6 }, signal) : Promise.resolve(null)), [q]);
  const results = q.length >= 2 ? data?.data || [] : [];

  // "/" anywhere (outside a text field) jumps to the search box
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = document.activeElement;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const go = (to) => {
    setOpen(false);
    setText('');
    setActive(-1);
    inputRef.current?.blur();
    navigate(to);
  };

  const submit = () => {
    const value = text.trim();
    if (!value) return;
    if (active >= 0 && results[active]) return go(`/incidents/${results[active].id}`);
    const ref = referenceFor(value);
    if (ref) return go(`/incidents/${ref}`);
    go(`/incidents?q=${encodeURIComponent(value)}`);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div className="relative hidden lg:block lg:w-52 xl:w-72" role="search">
      <i className="fas fa-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" />
      <input
        ref={inputRef}
        id="global-search"
        type="search"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)} // let a click on a suggestion land first
        onKeyDown={onKeyDown}
        placeholder={t('search.placeholder')}
        aria-label={t('search.label')}
        aria-expanded={open && results.length > 0}
        aria-controls="global-search-results"
        aria-autocomplete="list"
        className="w-full rounded-md border border-slate-200/80 bg-slate-50 py-2 pl-8 pr-8 text-xs text-slate-800 placeholder:text-slate-400 focus:border-bgb-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-bgb-500/20"
      />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-slate-200 bg-white px-1.5 text-xs font-semibold text-slate-400">/</kbd>

      {open && q.length >= 2 && (
        <div id="global-search-results" role="listbox" className="absolute left-0 top-11 z-50 w-[26rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-slate-200 bg-white shadow-xl">
          {results.length ? (
            results.map((inc, i) => (
              <button
                key={inc.id}
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(`/incidents/${inc.id}`)}
                className={cn('flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-bgb-50', i === active && 'bg-bgb-50')}
              >
                <span className="shrink-0 font-mono font-semibold text-bgb-700">{inc.id}</span>
                <span className="min-w-0 flex-1 truncate text-slate-700">{inc.title}</span>
                <StatusBadge status={inc.status} />
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-xs text-slate-400">{t('search.noMatch')}</p>
          )}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => go(`/incidents?q=${encodeURIComponent(text.trim())}`)}
            className="flex w-full items-center gap-2 border-t border-slate-100 bg-slate-50 px-3 py-2 text-left text-xs font-semibold text-bgb-700 hover:bg-slate-100"
          >
            <i className="fas fa-list" /> {t('search.all', { q: text.trim() })}
          </button>
        </div>
      )}
    </div>
  );
}
