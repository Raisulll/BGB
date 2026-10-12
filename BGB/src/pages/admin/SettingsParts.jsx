import { useEffect, useState } from 'react';
import Card from '../../components/ui/Card';

// Building blocks for Admin › Security & system: one look for every section (spec #46).

/** A settings section: card with a one-line description, a padded body and an optional footer. */
export function SettingsSection({ id, title, icon, description, actions, footer, children }) {
  return (
    <Card id={id} title={title} icon={icon} actions={actions} bodyClassName="p-0" className="scroll-mt-4">
      {description && <p className="px-4 pt-4 text-sm text-slate-600 sm:px-5">{description}</p>}
      <div className="px-4 pb-1 sm:px-5">{children}</div>
      {footer && <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 px-4 py-3 sm:px-5">{footer}</div>}
    </Card>
  );
}

/** Figures in a row of equal cells (e.g. archive counts, e-mail counts) */
export function StatGrid({ items }) {
  return (
    // 1px gaps over a slate background draw the dividing lines between cells at any column count
    <dl className={`my-4 grid gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200 ${items.length === 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'}`}>
      {items.map(({ label, value, tone }) => (
        <div key={label} className="bg-white p-3">
          <dt className="text-xs text-slate-600">{label}</dt>
          <dd className={`mt-0.5 text-xl font-semibold tabular-nums ${tone || 'text-slate-900'}`}>{value ?? '–'}</dd>
        </div>
      ))}
    </dl>
  );
}

const TONES = {
  ok: { icon: 'fa-circle-check', cls: 'text-bgb-700' },
  warn: { icon: 'fa-triangle-exclamation', cls: 'text-amber-700' },
  bad: { icon: 'fa-circle-xmark', cls: 'text-red-700' },
  neutral: { icon: 'fa-circle-info', cls: 'text-slate-500' },
};

/** A status in words with a matching icon (state never shown by colour alone) */
export function StatusText({ tone = 'neutral', children }) {
  const t = TONES[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${t.cls}`}>
      <i className={`fas ${t.icon}`} aria-hidden="true" />
      {children}
    </span>
  );
}

/** Label on the left, value on the right; stacks on phones */
export function InfoRow({ label, children }) {
  return (
    <div className="flex flex-col gap-1 border-b border-slate-200 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="text-sm text-slate-700">{label}</span>
      <span className="min-w-0 sm:text-right">{children}</span>
    </div>
  );
}

/**
 * Section menu for a long settings tab (wide screens): jumps to a section and marks the one
 * nearest the top of the visible area. `items` = [[id, label]]; sections have id `${prefix}${id}`.
 */
export function SectionMenu({ items, prefix, label }) {
  const [current, setCurrent] = useState(items[0]?.[0]);
  const ids = items.map(([id]) => id).join(',');
  useEffect(() => {
    const list = ids.split(',');
    const els = list.map((id) => document.getElementById(`${prefix}${id}`)).filter(Boolean);
    const update = (e) => {
      let cur = list[0];
      for (const el of els) if (el.getBoundingClientRect().top <= 140) cur = el.id.slice(prefix.length);
      // The last sections may never reach the top: at the end of the page the last one is current
      const sc = e?.target instanceof Element ? e.target : null;
      if (sc && els.length && sc.contains(els[els.length - 1]) && sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4) cur = list[list.length - 1];
      setCurrent(cur);
    };
    document.addEventListener('scroll', update, true); // the page scrolls inside the layout, not the window
    update();
    return () => document.removeEventListener('scroll', update, true);
  }, [ids, prefix]);
  const goTo = (id) => document.getElementById(`${prefix}${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <nav aria-label={label} className="hidden lg:block">
      <ul className="sticky top-4 space-y-0.5 border-l border-slate-200">
        {items.map(([id, text]) => (
          <li key={id}>
            <button
              type="button"
              onClick={() => goTo(id)}
              aria-current={current === id ? 'true' : undefined}
              className={`-ml-px block w-full border-l-2 px-3 py-1.5 text-left text-sm focus-visible:outline-2 focus-visible:outline-bgb-700 ${
                current === id ? 'border-bgb-700 font-medium text-bgb-800' : 'border-transparent text-slate-600 hover:border-slate-400 hover:text-slate-900'
              }`}
            >
              {text}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
