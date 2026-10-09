import { LANGUAGES, useI18n } from '../../i18n/I18nContext';

/** EN | বাং toggle (spec #43). `tone="dark"` for the login page's dark background. */
export default function LanguageSwitcher({ tone = 'light' }) {
  const { lang, setLang, t } = useI18n();
  const base = tone === 'dark' ? 'border-white/25 bg-white/10' : 'border-slate-200/80 bg-slate-100/90';
  return (
    <div role="group" aria-label={t('common.language')} className={`flex items-center rounded-xl border p-0.5 ${base}`}>
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
            className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors ${
              active
                ? 'bg-emerald-600 text-white shadow-sm'
                : tone === 'dark'
                  ? 'text-white/80 hover:text-white'
                  : 'text-slate-600 hover:text-emerald-700'
            }`}
          >
            {l.short}
          </button>
        );
      })}
    </div>
  );
}
