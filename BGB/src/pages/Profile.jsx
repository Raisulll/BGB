import { useState } from 'react';
import { Link } from 'react-router-dom';
import * as authApi from '../api/auth';
import { errorMessage } from '../api/client';
import { useToast } from '../context/ToastContext';
import useApi from '../hooks/useApi';
import { formatDateTime, timeAgo } from '../utils/helpers';
import Card from '../components/ui/Card';
import { PushCard } from '../components/messaging/PushSettings';
import ErrorState from '../components/ui/ErrorState';
import Spinner from '../components/ui/Spinner';
import { useI18n } from '../i18n/I18nContext';

// Specs #24, #28 — the user's own account, where they are signed in, and their recent sign-in
// events, so an unexpected session or a failed login on their account is noticed by its owner.
// Everything comes from GET /auth/profile (own data only).

/** "Chrome on Windows" from a user-agent string (display only). */
function deviceName(ua, t) {
  if (!ua) return t('profile.unknownDevice');
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : null;
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : null;
  return browser && os ? t('profile.browserOn', { browser, os }) : browser || os || t('profile.unknownDevice');
}

// Only failures stand out; ordinary sign-ins are neutral
const EVENT_STYLE = {
  LOGIN_FAILED: 'text-red-700',
  LOGIN_BLOCKED: 'text-red-700',
  ACCOUNT_LOCKED: 'text-red-700',
};

function Field({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-gray-800">{children}</dd>
    </div>
  );
}

export default function Profile() {
  const { t, tv } = useI18n();
  const { showToast } = useToast();
  const { data, error, message, reload } = useApi(() => authApi.profile(), []);
  const [busy, setBusy] = useState(false);

  if (error) return <ErrorState message={message} onRetry={reload} />;
  if (!data) return <Spinner />;
  const { user, sessions, activity } = data;
  const others = sessions.filter((s) => !s.current).length;

  const revokeOthers = async () => {
    if (!window.confirm(t('profile.revokeConfirm', { n: others }))) return;
    setBusy(true);
    try {
      const r = await authApi.revokeOtherSessions();
      showToast(t('profile.revoked', { n: r.revoked }), 'success');
      reload();
    } catch (err) {
      showToast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 sm:space-y-6">
      {/* Identity */}
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-bgb-600 text-white shadow ring-2 ring-bgb-200">
              <i className="fas fa-user-shield text-xl" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold text-gray-900 sm:text-xl">{user.name}</h2>
              <p className="text-sm text-gray-500">{user.username}</p>
              <span className="mt-1 inline-block rounded-full bg-bgb-100 px-2.5 py-0.5 text-xs font-semibold text-bgb-800 ring-1 ring-bgb-300">{tv('role', user.role)}</span>
            </div>
          </div>
          <Link to="/change-password" className="btn btn-secondary">
            <i className="fas fa-key" /> {t('header.changePassword')}
          </Link>
        </div>
        <dl className="mt-5 grid grid-cols-1 gap-4 border-t border-gray-100 pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t('header.unit')}>{user.scope}</Field>
          <Field label={t('profile.email')}>{user.email}</Field>
          <Field label={t('profile.lastLogin')}>{user.lastLogin ? formatDateTime(user.lastLogin) : t('common.na')}</Field>
          <Field label={t('profile.memberSince')}>{formatDateTime(user.createdAt)}</Field>
        </dl>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
        {/* Sessions */}
        <Card
          title={t('profile.sessions', { n: sessions.length })}
          icon="fa-laptop"
          actions={
            others > 0 && (
              <button id="revoke-others" onClick={revokeOthers} disabled={busy} className="btn bg-red-50 text-xs text-red-600 hover:bg-red-100">
                <i className={`fas ${busy ? 'fa-spinner fa-spin' : 'fa-sign-out-alt'}`} /> {t('profile.revokeOthers')}
              </button>
            )
          }
          bodyClassName="p-0"
        >
          <ul className="divide-y divide-gray-100">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                <i className={`fas ${/Android|iPhone|iPad/.test(s.userAgent || '') ? 'fa-mobile-alt' : 'fa-desktop'} mt-1 text-gray-400`} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-gray-800">
                    {deviceName(s.userAgent, t)}
                    {s.current && <span className="rounded-full bg-bgb-100 px-2 py-0.5 text-xs font-bold text-bgb-800">{t('profile.thisDevice')}</span>}
                  </p>
                  <p className="text-xs text-gray-500">
                    {s.ipAddress || t('common.na')} · {t('profile.signedIn', { date: formatDateTime(s.startedAt) })}
                  </p>
                  <p className="text-xs text-gray-400">{t('profile.lastActive', { ago: timeAgo(s.lastSeenAt, t) })}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="border-t border-gray-100 px-4 py-2.5 text-xs text-gray-400 sm:px-5">{t('profile.sessionsNote')}</p>
        </Card>

        {/* Recent sign-in activity */}
        <Card title={t('profile.activity')} icon="fa-user-clock" bodyClassName="p-0">
          {activity.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="th">{t('profile.thEvent')}</th>
                    <th className="th">{t('profile.thTime')}</th>
                    <th className="th">{t('profile.thIp')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {activity.map((a, i) => (
                    <tr key={i}>
                      <td className={`td font-medium ${EVENT_STYLE[a.action] || 'text-slate-800'}`}>{tv('auditAction', a.action)}</td>
                      <td className="td whitespace-nowrap text-slate-700">{formatDateTime(a.date)}</td>
                      <td className="td font-mono text-xs text-slate-700">{a.ipAddress || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-4 text-sm text-gray-400">{t('profile.noActivity')}</p>
          )}
          <p className="border-t border-gray-100 px-4 py-2.5 text-xs text-gray-400 sm:px-5">{t('profile.activityNote')}</p>
        </Card>
      </div>

      {/* Calls and messages on this device while BIRDS is closed (messages permission only) */}
      {(user.permissions || []).includes('messages') && <PushCard />}

      {/* What this account can open */}
      <Card title={t('profile.access')} icon="fa-shield-alt">
        <div className="flex flex-wrap gap-2">
          {(user.permissions || []).map((p) => (
            <span key={p} className="rounded-lg border border-bgb-200 bg-bgb-50 px-2.5 py-1 text-xs font-semibold text-bgb-800">
              {t(`nav.${p}`)}
            </span>
          ))}
        </div>
      </Card>
    </div>
  );
}
