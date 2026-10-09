import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as authApi from '../api/auth';
import * as incidentsApi from '../api/incidents';
import * as notificationsApi from '../api/notifications';
import { errorMessage, setSessionEndedHandler } from '../api/client';
import { lastActivityAt } from '../utils/activity';
import { useToast } from './ToastContext';

// Thin session + cache layer over the BIRDS REST API (CLAUDE.md §18.2). Everything that matters
// (permissions, scope, workflow rules, audit) is enforced and recorded by the server; this
// context only holds what every page needs: the signed-in user, the policy, form reference
// data and the notification feed.

const AppContext = createContext(null);

const NOTIFICATION_POLL_MS = 30_000; // §23
const DEFAULT_POLICY = {
  sessionTimeoutMinutes: 30,
  password: { minLength: 8, requireUppercase: true, requireNumber: true, requireSpecial: true },
};

const SESSION_END_MESSAGES = {
  SESSION_EXPIRED: 'Your session expired after a period of inactivity. Please sign in again.',
  SESSION_ENDED: 'Your session has ended. Please sign in again.',
};

export function AppProvider({ children }) {
  const { showToast } = useToast();
  const [booting, setBooting] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [policy, setPolicy] = useState(DEFAULT_POLICY);
  const [meta, setMeta] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const signingOut = useRef(false);
  const userRef = useRef(null);
  userRef.current = currentUser;

  const clearSession = useCallback(() => {
    setCurrentUser(null);
    setMeta(null);
    setNotifications([]);
    setUnreadCount(0);
  }, []);

  // Loads the user, effective permissions and policy for the current access token.
  const hydrate = useCallback(async () => {
    const { user, policy: p } = await authApi.me();
    setCurrentUser(user);
    if (p) setPolicy(p);
    return user;
  }, []);

  // Restore the session from the refresh cookie on page load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await authApi.resume();
        if (!cancelled) await hydrate();
      } catch {
        // No session (or it ended): the router shows /login.
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrate]);

  // The API client calls this when the server ends the session (logout elsewhere, idle timeout,
  // deactivation, role change) or demands a password change.
  useEffect(() => {
    setSessionEndedHandler((err) => {
      if (signingOut.current) return;
      if (err?.code === 'PASSWORD_CHANGE_REQUIRED') {
        setCurrentUser((u) => (u ? { ...u, mustChangePassword: true } : u));
        return;
      }
      // Several in-flight requests can fail together; announce the end of the session once.
      if (userRef.current) showToast(SESSION_END_MESSAGES[err?.code] || SESSION_END_MESSAGES.SESSION_ENDED, 'warning');
      userRef.current = null;
      authApi.setSessionHint(false);
      clearSession();
    });
    return () => setSessionEndedHandler(() => {});
  }, [showToast, clearSession]);

  // ---------- Auth (specs #4, #28, #29) ----------
  // Returns { user } on success, or { error, locked } on failure.
  const login = useCallback(
    async (username, password) => {
      try {
        await authApi.login(username.trim(), password);
        const user = await hydrate();
        return { user };
      } catch (err) {
        return { error: errorMessage(err, 'Sign-in failed.'), locked: err?.status === 423 };
      }
    },
    [hydrate],
  );

  // reason: 'manual' (default) | 'timeout'
  const logout = useCallback(
    async (reason = 'manual') => {
      signingOut.current = true;
      try {
        await authApi.logout(reason);
      } catch {
        // Already ended server-side; nothing else to do.
      } finally {
        signingOut.current = false;
        clearSession();
      }
    },
    [clearSession],
  );

  const changePassword = useCallback(
    async (currentPassword, newPassword) => {
      await authApi.changePassword(currentPassword, newPassword);
      await hydrate();
    },
    [hydrate],
  );

  // ---------- Permissions (spec #3) ----------
  // The server computes the user's effective pages from role_permissions; the UI only mirrors them.
  const hasPermission = useCallback(
    (user, pageId) => {
      const u = user || currentUser;
      return Boolean(u?.permissions?.includes(pageId));
    },
    [currentUser],
  );

  // ---------- Reference data for forms and filters (specs #6, #9) ----------
  const canListIncidents = Boolean(currentUser?.permissions?.includes('incidents')) && !currentUser?.mustChangePassword;
  const loadMeta = useCallback(async () => {
    const m = await incidentsApi.meta();
    setMeta(m);
    return m;
  }, []);
  useEffect(() => {
    if (!canListIncidents) return;
    loadMeta().catch(() => {});
  }, [canListIncidents, loadMeta]);

  // ---------- Notifications (spec #23) ----------
  const canPoll = Boolean(currentUser) && !currentUser?.mustChangePassword;
  const lastPoll = useRef(0);
  const refreshNotifications = useCallback(async () => {
    // A poll with no user input since the previous one is background traffic (spec #28).
    const background = lastActivityAt() < lastPoll.current;
    lastPoll.current = Date.now();
    const res = await notificationsApi.list({ pageSize: 50 }, { background });
    setNotifications(res.data);
    setUnreadCount(res.unreadCount ?? res.data.filter((n) => !n.read).length);
  }, []);

  useEffect(() => {
    if (!canPoll) return;
    lastPoll.current = 0;
    refreshNotifications().catch(() => {});
    const timer = setInterval(() => refreshNotifications().catch(() => {}), NOTIFICATION_POLL_MS);
    return () => clearInterval(timer);
  }, [canPoll, refreshNotifications]);

  const markAllRead = useCallback(async () => {
    try {
      await notificationsApi.markAllRead();
      setNotifications((list) => list.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      showToast(errorMessage(err), 'error');
    }
  }, [showToast]);

  const markRead = useCallback(async (id) => {
    try {
      await notificationsApi.markRead(id);
      setNotifications((list) => list.map((n) => (n.id === id ? { ...n, read: true } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {}
  }, []);

  const value = useMemo(
    () => ({
      booting,
      currentUser,
      policy,
      login,
      logout,
      changePassword,
      refreshUser: hydrate,
      hasPermission,
      meta,
      reloadMeta: loadMeta,
      notifications,
      unreadCount,
      refreshNotifications,
      markAllRead,
      markRead,
    }),
    [
      booting,
      currentUser,
      policy,
      login,
      logout,
      changePassword,
      hydrate,
      hasPermission,
      meta,
      loadMeta,
      notifications,
      unreadCount,
      refreshNotifications,
      markAllRead,
      markRead,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useApp = () => useContext(AppContext);
