import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../context/ToastContext';
import { useI18n } from '../../i18n/I18nContext';
import { disablePush, enablePush, pushState } from '../../utils/push';
import Card from '../ui/Card';

const DISMISS_KEY = 'birds.pushPromptDismissed'; // per-browser convenience only

/** This device's push state; refresh() re-reads it. null while loading. */
export function usePushState() {
  const [state, setState] = useState(null);
  const refresh = useCallback(() => pushState().then(setState, () => setState('unsupported')), []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return [state, setState, refresh];
}

function useToggle(setState) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const run = async (fn) => {
    setBusy(true);
    try {
      const next = await fn();
      setState(next);
      if (next === 'on') showToast(t('push.turnedOn'), 'success');
      else if (next === 'denied') showToast(t('push.blocked'), 'warning');
    } catch {
      showToast(t('push.failed'), 'error');
    } finally {
      setBusy(false);
    }
  };
  return { busy, turnOn: () => run(enablePush), turnOff: () => run(disablePush) };
}

/** Profile card: notifications for calls and messages on this device. */
export function PushCard() {
  const { t } = useI18n();
  const [state, setState] = usePushState();
  const { busy, turnOn, turnOff } = useToggle(setState);
  if (state === null) return null;

  return (
    <Card title={t('push.title')} icon="fa-bell">
      <p className="text-sm text-slate-700">{t('push.explain')}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-slate-900" aria-live="polite">
          {t('push.status')}: {t(`push.state.${state}`)}
        </span>
        {state === 'off' && (
          <button type="button" onClick={turnOn} disabled={busy} className="btn btn-primary btn-sm">
            {busy && <i className="fas fa-spinner fa-spin" aria-hidden="true" />}
            {busy ? t('push.turningOn') : t('push.turnOn')}
          </button>
        )}
        {state === 'on' && (
          <button type="button" onClick={turnOff} disabled={busy} className="btn btn-secondary btn-sm">
            {t('push.turnOff')}
          </button>
        )}
      </div>
      {['denied', 'install-first', 'server-off'].includes(state) && <p className="mt-2 text-xs text-slate-600">{t(`push.hint.${state}`)}</p>}
      <p className="mt-3 text-xs text-slate-500">{t('push.privacy')}</p>
    </Card>
  );
}

/** One-time suggestion above the conversation list while push is off on this device. */
export function PushPrompt() {
  const { t } = useI18n();
  const [state, setState] = usePushState();
  const { busy, turnOn } = useToggle(setState);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  if (dismissed || !['off', 'install-first'].includes(state)) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {}
  };

  return (
    <div role="status" className="flex flex-wrap items-center gap-3 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800">
      <i className="fas fa-bell text-bgb-700" aria-hidden="true" />
      <span className="min-w-48 flex-1">{state === 'off' ? t('push.prompt') : t('push.hint.install-first')}</span>
      {state === 'off' && (
        <button type="button" onClick={turnOn} disabled={busy} className="btn btn-primary btn-sm">
          {busy && <i className="fas fa-spinner fa-spin" aria-hidden="true" />}
          {busy ? t('push.turningOn') : t('push.turnOn')}
        </button>
      )}
      <button type="button" onClick={dismiss} className="btn btn-secondary btn-sm">
        {t('push.notNow')}
      </button>
    </div>
  );
}
