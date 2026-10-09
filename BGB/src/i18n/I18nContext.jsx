import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import en from './en';
import bn from './bn';
import { setErrorTranslator } from '../api/client';

// Spec #43 — English + Bangla interface. English is the primary language and the fallback for any
// key missing from another dictionary. Data entered by users (titles, categories, unit names)
// is shown as stored; only interface text and fixed values (status, severity, role) are translated.

const DICTS = { en, bn };
export const LANGUAGES = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'bn', label: 'বাংলা', short: 'বাং' },
];
const LANG_KEY = 'birds.lang'; // per-browser preference

function lookup(dict, key) {
  let node = dict;
  for (const part of key.split('.')) {
    if (node == null || typeof node !== 'object') return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

const interpolate = (text, vars) => (vars ? text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : text);

function initialLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved && DICTS[saved]) return saved;
  } catch {}
  return 'en';
}

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(initialLang);

  useEffect(() => {
    document.documentElement.lang = lang;
    setErrorTranslator({ lookup: (key) => lookup(DICTS[lang], key), preferLocal: lang !== 'en' });
  }, [lang]);

  const setLang = useCallback((code) => {
    if (!DICTS[code]) return;
    setLangState(code);
    try {
      localStorage.setItem(LANG_KEY, code);
    } catch {}
  }, []);

  /** t('incidents.title') or t('common.pageOf', { page: 1, total: 3 }) */
  const t = useCallback(
    (key, vars) => {
      const text = lookup(DICTS[lang], key) ?? lookup(en, key);
      if (text === undefined) {
        if (import.meta.env.DEV) console.warn(`[i18n] missing key: ${key}`);
        return key;
      }
      return interpolate(text, vars);
    },
    [lang],
  );

  /** Translates a fixed value (status, severity, role, audit action…) with the raw value as fallback. */
  const tv = useCallback((group, value) => (value == null ? '' : lookup(DICTS[lang], `${group}.${value}`) ?? lookup(en, `${group}.${value}`) ?? value), [lang]);

  const value = useMemo(() => ({ lang, setLang, t, tv }), [lang, setLang, t, tv]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useI18n = () => useContext(I18nContext);
