import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as alertsApi from '../api/alerts';
import { onRealtime } from '../api/realtime';
import { useApp } from './AppContext';
import { useToast } from './ToastContext';
import { useI18n } from '../i18n/I18nContext';

// Flash Alerts (spec #23/#58 extension): the active alerts addressed to this user. Loaded at
// sign-in, reloaded on every realtime "alert" event and, as a fallback for devices without the
// realtime channel, every 30 seconds in the background (background: true, so polling never keeps
// an idle session alive, spec #28). Mounted in Layout; AlertTakeover and AlertBanner read it.
const AlertsContext = createContext(null);
const POLL_MS = 30_000;

export function AlertsProvider({ children }) {
  const { currentUser } = useApp();
  const { showToast } = useToast();
  const { t } = useI18n();
  const [active, setActive] = useState([]);
  const seenUpdates = useRef(new Map()); // alert id -> number of updates already shown
  const enabled = Boolean(currentUser && !currentUser.mustChangePassword);

  const refresh = useCallback(async () => {
    try {
      const list = await alertsApi.active({ background: true });
      // A new update on an alert already acknowledged: tell the user once
      for (const a of list) {
        const before = seenUpdates.current.get(a.id);
        const n = a.updates.filter((u) => u.kind === 'update').length;
        if (before !== undefined && n > before && a.me.acknowledgedAt) showToast(t('alerts.newUpdate', { ref: a.reference }), 'warning');
        seenUpdates.current.set(a.id, n);
      }
      setActive(list);
    } catch {
      // Offline or signed out: keep what is shown; the next poll or event retries
    }
  }, [showToast, t]);

  useEffect(() => {
    if (!enabled) return undefined;
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    const off = onRealtime((msg) => msg.type === 'alert' && refresh());
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      off();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, refresh]);

  const acknowledge = useCallback(async (id) => {
    const updated = await alertsApi.acknowledge(id);
    setActive((list) => list.map((a) => (a.id === id ? updated : a)));
    return updated;
  }, []);

  const value = useMemo(() => {
    const now = Date.now();
    const live = enabled ? active.filter((a) => new Date(a.validUntil).getTime() > now) : [];
    return {
      active: live,
      // Addressed to me and not yet acknowledged: these take over the screen
      pending: live.filter((a) => a.me.recipient && !a.me.acknowledgedAt),
      refresh,
      acknowledge,
    };
  }, [active, enabled, refresh, acknowledge]);

  return <AlertsContext.Provider value={value}>{children}</AlertsContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAlerts() {
  return useContext(AlertsContext) ?? { active: [], pending: [], refresh: () => {}, acknowledge: async () => {} };
}
