import { LANGUAGES, useI18n } from '../../i18n/I18nContext';

/** EN | বাং toggle (spec #43). `tone="dark"` for the login page's dark background. */
export default function LanguageSwitcher({ tone = 'light' }) {
  const { lang, setLang, t } = useI18n();
  const base = tone === 'dark' ? 'border-white/30 bg-white/10' : 'border-slate-300 bg-white';
  return (
    <div role="group" aria-label={t('common.language')} className={`flex items-center rounded-md border p-0.5 ${base}`}>
      {LANGUAGES.map((l) => {
        const active = l.code === lang;
        return (
          <button
            key={l.code}
            type="button"
            lang={l.code}
            onClick={() => setLang(l.code)}
            aria-pressed={active}
            title={l.label}
            className={`rounded px-2.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bgb-700 ${
              active ? 'bg-bgb-700 text-white' : tone === 'dark' ? 'text-white/85 hover:text-white' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            {l.short}
          </button>
        );
      })}
    </div>
  );
}
