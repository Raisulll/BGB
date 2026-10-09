import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useToast } from '../../context/ToastContext';
import * as adminApi from '../../api/admin';
import { errorMessage } from '../../api/client';
import useApi from '../../hooks/useApi';
import { formatDateTime } from '../../utils/helpers';
import Card from '../../components/ui/Card';
import Toggle from '../../components/ui/Toggle';
import { DemoBadge } from '../../components/ui/Demo';

// Specs #28, #29, #44, #47 — system_config, edited through PATCH /admin/config. The server
// validates types and ranges, applies the change at once and audits old → new values.
const SECTIONS = [
  {
    title: 'Password Policy & Lockout',
    icon: 'fa-key',
    items: [
      { key: 'password.min_length', label: 'Minimum Password Length', hint: 'Characters required in every new password', icon: 'fa-text-height' },
      { key: 'password.require_uppercase', label: 'Require Uppercase Letter', hint: 'At least one A-Z', icon: 'fa-font' },
      { key: 'password.require_number', label: 'Require Number', hint: 'At least one 0-9', icon: 'fa-hashtag' },
      { key: 'password.require_special', label: 'Require Special Character', hint: 'At least one symbol such as @ # $ %', icon: 'fa-asterisk' },
      { key: 'password.max_attempts', label: 'Max Failed Login Attempts', hint: 'Consecutive failures before the account locks', icon: 'fa-user-lock' },
      { key: 'password.lockout_minutes', label: 'Lockout Duration (min)', hint: 'How long a locked account stays locked', icon: 'fa-hourglass-half' },
    ],
  },
  {
    title: 'Session Controls',
    icon: 'fa-clock',
    items: [
      { key: 'session.timeout_minutes', label: 'Idle Session Timeout (min)', hint: 'Sessions end after this long without activity', icon: 'fa-stopwatch' },
      { key: 'session.single_session', label: 'Single Active Session', hint: 'A new sign-in ends the user\'s other sessions', icon: 'fa-desktop' },
    ],
  },
  {
    title: 'Data Retention',
    icon: 'fa-database',
    items: [
      { key: 'data.retention_days', label: 'Data Retention Period (days)', hint: 'Policy value; the automated retention/archiving job is not built yet', icon: 'fa-history', pending: true },
    ],
  },
];

/** One editable system_config value. `item.demo` adds the DEMO badge (setting is stored, feature not active). */
export function ConfigRow({ item, row, onSave, busy }) {
  const [draft, setDraft] = useState(String(row.value));
  const isBool = row.type === 'bool';

  const commit = () => {
    const n = Number(draft);
    if (draft.trim() === '' || !Number.isInteger(n)) return setDraft(String(row.value));
    if (n === row.value) return;
    onSave(row.key, n, () => setDraft(String(row.value)));
  };

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200/90 bg-gray-50/60 p-3.5 transition-all hover:border-bgb-300 hover:bg-white">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-bgb-200/60 bg-bgb-50 text-bgb-700">
          <i className={`fas ${item.icon} text-sm`} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-gray-800">
            {item.label}
            {item.pending && <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">JOB PENDING</span>}
            {item.demo && <DemoBadge className="ml-1.5" />}
          </p>
          <p className="text-[11px] text-gray-500">
            {item.hint}
            {!isBool && row.min !== undefined && ` (${row.min}–${row.max})`}
          </p>
        </div>
      </div>
      <div className={busy === row.key ? 'opacity-50' : ''}>
        {isBool ? (
          <Toggle label={item.label} checked={row.value} onChange={(v) => !busy && onSave(row.key, v)} />
        ) : (
          <input
            type="number"
            min={row.min}
            max={row.max}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            disabled={Boolean(busy)}
            aria-label={item.label}
            className="form-input w-24 shrink-0 text-center text-xs font-semibold"
          />
        )}
      </div>
    </div>
  );
}

export default function AdminSettings({ config, onChange }) {
  const { refreshUser } = useApp();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(null);
  const { data: health, reload: recheck, loading: checking } = useApi(() => adminApi.health(), []);
  const byKey = Object.fromEntries(config.map((r) => [r.key, r]));
  const counters = config.filter((r) => r.key.startsWith('incident.next_id.'));

  // Number fields commit on blur, so each edit is one PATCH and one audit entry
  const save = async (key, value, revert) => {
    setBusy(key);
    try {
      onChange(await adminApi.updateConfig({ [key]: value }));
      if (key.startsWith('session.') || key.startsWith('password.')) refreshUser().catch(() => {}); // own idle timer / rules
      showToast('Setting saved', 'success');
    } catch (err) {
      showToast(errorMessage(err), 'error');
      revert?.();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid grid-cols-1 items-start gap-4 sm:gap-6 lg:grid-cols-2">
      {SECTIONS.map((section) => (
        <Card key={section.title} title={section.title} icon={section.icon} bodyClassName="space-y-3">
          {section.items.map((item) =>
            byKey[item.key] ? <ConfigRow key={`${item.key}:${byKey[item.key].value}`} item={item} row={byKey[item.key]} onSave={save} busy={busy} /> : null,
          )}
        </Card>
      ))}

      <Card
        title="System Status"
        icon="fa-server"
        bodyClassName="space-y-3"
        actions={
          <button onClick={recheck} className="btn btn-secondary text-xs" disabled={checking}>
            <i className={`fas fa-sync-alt ${checking ? 'fa-spin' : ''}`} /> Check
          </button>
        }
      >
        <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200/90 bg-gray-50/60 p-3.5 text-xs">
          <span className="font-bold text-gray-800">
            <i className="fas fa-network-wired mr-2 text-bgb-600" />
            API service
          </span>
          {health ? (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200/60 bg-emerald-50 px-2.5 py-1 font-bold text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> {health.status === 'ok' ? 'Operational' : health.status}
            </span>
          ) : (
            <span className="font-bold text-gray-400">{checking ? 'Checking…' : 'Unreachable'}</span>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200/90 bg-gray-50/60 p-3.5 text-xs">
          <span className="font-bold text-gray-800">
            <i className="fas fa-database mr-2 text-bgb-600" />
            Database (PostgreSQL)
          </span>
          {health?.database === 'up' ? (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200/60 bg-emerald-50 px-2.5 py-1 font-bold text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Connected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-red-200/60 bg-red-50 px-2.5 py-1 font-bold text-red-700">
              <span className="h-2 w-2 rounded-full bg-red-500" /> {health ? 'Down' : 'Unknown'}
            </span>
          )}
        </div>
        {health?.time && <p className="text-[11px] text-gray-500">Server time: {formatDateTime(health.time, { withSeconds: true })} BST</p>}

        {counters.length > 0 && (
          <div className="border-t border-gray-100 pt-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">Next incident reference numbers</p>
            {counters.map((c) => (
              <div key={c.key} className="flex justify-between text-xs">
                <span className="text-gray-600">{c.key.split('.').pop()}</span>
                <span className="font-mono font-bold text-bgb-700">
                  BIRDS-{c.key.split('.').pop()}-{String(c.value).padStart(4, '0')}
                </span>
              </div>
            ))}
            <p className="mt-1 text-[11px] text-gray-400">Read-only; allocated atomically by the server.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
