import { useState } from 'react';
import { useI18n } from '../../i18n/I18nContext';

/** Accessible on/off switch. Works controlled (checked + onChange) or uncontrolled (defaultChecked). */
export default function Toggle({ checked, defaultChecked = true, onChange, label }) {
  const { t } = useI18n();
  const [inner, setInner] = useState(defaultChecked);
  const isOn = checked ?? inner;

  const toggle = () => {
    if (checked === undefined) setInner(!isOn);
    onChange?.(!isOn);
  };

  return (
    <span className="inline-flex items-center gap-2">
    <button
      type="button"
      role="switch"
      aria-checked={isOn}
      aria-label={label}
      onClick={toggle}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bgb-700 focus-visible:ring-offset-2 ${
        isOn ? 'bg-bgb-700' : 'bg-slate-400'
      }`}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${isOn ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
    <span className="w-7 text-xs font-medium text-slate-700" aria-hidden="true">{isOn ? t('common.on') : t('common.off')}</span>
    </span>
  );
}
