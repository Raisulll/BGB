import { useState } from 'react';

/** Accessible on/off switch. Works controlled (checked + onChange) or uncontrolled (defaultChecked). */
export default function Toggle({ checked, defaultChecked = true, onChange, label }) {
  const [inner, setInner] = useState(defaultChecked);
  const isOn = checked ?? inner;

  const toggle = () => {
    if (checked === undefined) setInner(!isOn);
    onChange?.(!isOn);
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isOn}
      aria-label={label}
      onClick={toggle}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bgb-500/40 ${
        isOn ? 'bg-bgb-500' : 'bg-gray-300'
      }`}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${isOn ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}
