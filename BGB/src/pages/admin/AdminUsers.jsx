import { useCallback, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useToast } from '../../context/ToastContext';
import * as usersApi from '../../api/users';
import * as authApi from '../../api/auth';
import { errorMessage } from '../../api/client';
import useApi, { useDebounced } from '../../hooks/useApi';
import { formatDateTime, validatePassword } from '../../utils/helpers';
import Card from '../../components/ui/Card';
import ErrorState from '../../components/ui/ErrorState';
import Modal, { OneTimeSecret } from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';

// Spec #3 — user accounts, roles and data scopes. Guards (no self role change or deactivation,
// at least one active HQ Administrator, sessions ended on privilege change) are enforced by the server.
const EMPTY_USER = { name: '', username: '', email: '', role: 'Battalion Operator', scope: '', password: '' };

/** 'HQ' plus every sector, battalion and BOP — the valid values for a user's scope */
function scopeOptions(hierarchy) {
  const out = [{ value: 'HQ', label: 'HQ (all units)' }];
  for (const [sector, bns] of Object.entries(hierarchy || {})) {
    out.push({ value: sector, label: sector });
    for (const [bn, { BOPs }] of Object.entries(bns)) {
      out.push({ value: bn, label: `  ${bn} (${sector})` });
      for (const bop of BOPs) out.push({ value: bop, label: `    ${bop}` });
    }
  }
  return out;
}

function StatusPill({ u }) {
  if (!u.isActive) return <span className="rounded-full border border-gray-300 bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600">DEACTIVATED</span>;
  if (u.locked) return <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">LOCKED</span>;
  if (u.mustChangePassword) return <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">PWD CHANGE DUE</span>;
  return <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">ACTIVE</span>;
}

export default function AdminUsers({ roles, hierarchy }) {
  const { currentUser, policy } = useApp();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const q = useDebounced(search.trim());
  const query = useMemo(() => ({ q, role: roleFilter, pageSize: 100 }), [q, roleFilter]);
  const { data, error, message, reload, loading } = useApi(() => usersApi.list(query), [query]);

  const [editing, setEditing] = useState(null); // user object, or EMPTY_USER for a new one
  const [form, setForm] = useState(EMPTY_USER);
  const [secret, setSecret] = useState(null); // { title, username, password }
  const [busy, setBusy] = useState(null);
  const scopes = useMemo(() => scopeOptions(hierarchy), [hierarchy]);
  const isNew = editing && !editing.id;

  const openNew = () => {
    setForm({ ...EMPTY_USER, scope: scopes[1]?.value || 'HQ' });
    setEditing(EMPTY_USER);
  };
  const openEdit = (u) => {
    setForm({ name: u.name, username: u.username, email: u.email, role: u.role, scope: u.scope, password: '' });
    setEditing(u);
  };
  const close = useCallback(() => setEditing(null), []);

  const save = async (e) => {
    e.preventDefault();
    if (isNew && form.password) {
      const pwdError = validatePassword(form.password, policy.password);
      if (pwdError) return showToast(pwdError, 'error');
    }
    setBusy('save');
    try {
      if (isNew) {
        const body = { username: form.username.trim(), name: form.name.trim(), role: form.role, scope: form.scope, email: form.email.trim() };
        if (form.password) body.password = form.password;
        const res = await usersApi.create(body);
        showToast(`User ${res.user.username} created`, 'success');
        if (res.temporaryPassword) setSecret({ title: 'Account created', username: res.user.username, password: res.temporaryPassword });
      } else {
        const patch = {};
        for (const k of ['name', 'role', 'scope', 'email']) if (form[k].trim() !== editing[k]) patch[k] = form[k].trim();
        if (!Object.keys(patch).length) return close();
        await usersApi.update(editing.id, patch);
        const ended = patch.role || patch.scope ? ' Their active sessions were ended.' : '';
        showToast(`${editing.username} updated.${ended}`, 'success');
      }
      setEditing(null);
      reload();
    } catch (err) {
      showToast(errorMessage(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  const act = async (u, kind) => {
    setBusy(`${kind}-${u.id}`);
    try {
      if (kind === 'deactivate') {
        if (!window.confirm(`Deactivate ${u.name} (${u.username})? Their sessions end immediately. Accounts are never deleted.`)) return;
        await usersApi.deactivate(u.id);
        showToast(`${u.username} deactivated`, 'success');
      } else if (kind === 'activate') {
        await usersApi.update(u.id, { isActive: true });
        showToast(`${u.username} reactivated`, 'success');
      } else if (kind === 'unlock') {
        await usersApi.update(u.id, { unlock: true });
        showToast(`${u.username} unlocked`, 'success');
      } else if (kind === 'reset') {
        if (!window.confirm(`Reset the password for ${u.name} (${u.username})? Their sessions end and they must set a new password at next sign-in.`)) return;
        const res = await authApi.adminResetPassword(u.id);
        setSecret({ title: 'Password reset', username: res.username, password: res.temporaryPassword });
      }
      reload();
    } catch (err) {
      showToast(errorMessage(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  const users = data?.data || [];
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const btn = 'inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50';

  return (
    <div className="space-y-4">
      <Card
        title={`User Accounts${data ? ` (${data.total})` : ''}`}
        icon="fa-users-cog"
        bodyClassName="p-0"
        actions={
          <>
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, username, email…" className="form-input w-full text-xs sm:w-56" />
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="form-input w-auto text-xs" aria-label="Filter by role">
              <option value="">All roles</option>
              {roles.map((r) => <option key={r.name}>{r.name}</option>)}
            </select>
            <button onClick={openNew} className="btn btn-primary">
              <i className="fas fa-user-plus" /> Add User
            </button>
          </>
        }
      >
        {error ? (
          <ErrorState message={message} onRetry={reload} />
        ) : !data ? (
          <Spinner />
        ) : (
          <div className={`overflow-x-auto ${loading ? 'opacity-60' : ''}`}>
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="th">ID</th>
                  <th className="th">Name / Username</th>
                  <th className="th">Role</th>
                  <th className="th hidden md:table-cell">Scope</th>
                  <th className="th">Status</th>
                  <th className="th hidden xl:table-cell">Last Login</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((u) => {
                  const self = u.id === currentUser.id;
                  return (
                    <tr key={u.id} className={`transition-colors hover:bg-gray-50 ${u.isActive ? '' : 'opacity-60'}`}>
                      <td className="td font-mono font-medium text-bgb-700">{u.id}</td>
                      <td className="td">
                        <p className="font-semibold text-gray-800">{u.name}</p>
                        <p className="font-mono text-[11px] text-gray-500">{u.username}</p>
                      </td>
                      <td className="td whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 rounded-full border border-navy-200/50 bg-navy-50 px-2.5 py-0.5 text-xs font-semibold text-navy-700">
                          <i className="fas fa-user-shield text-[10px]" />
                          {u.role}
                        </span>
                      </td>
                      <td className="td hidden text-gray-600 md:table-cell">{u.scope}</td>
                      <td className="td">
                        <StatusPill u={u} />
                      </td>
                      <td className="td hidden whitespace-nowrap text-xs text-gray-500 xl:table-cell">{u.lastLogin ? formatDateTime(u.lastLogin) : 'Never'}</td>
                      <td className="td">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <button onClick={() => openEdit(u)} disabled={Boolean(busy)} className={`${btn} border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100`}>
                            <i className="fas fa-edit text-[10px]" /> Edit
                          </button>
                          {u.locked && (
                            <button onClick={() => act(u, 'unlock')} disabled={Boolean(busy)} className={`${btn} border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}>
                              <i className="fas fa-unlock text-[10px]" /> Unlock
                            </button>
                          )}
                          {u.isActive && (
                            <button onClick={() => act(u, 'reset')} disabled={Boolean(busy)} className={`${btn} border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100`}>
                              <i className="fas fa-key text-[10px]" /> Reset Password
                            </button>
                          )}
                          {!self &&
                            (u.isActive ? (
                              <button onClick={() => act(u, 'deactivate')} disabled={Boolean(busy)} className={`${btn} border-red-200 bg-red-50 text-red-700 hover:bg-red-100`}>
                                <i className="fas fa-user-slash text-[10px]" /> Deactivate
                              </button>
                            ) : (
                              <button onClick={() => act(u, 'activate')} disabled={Boolean(busy)} className={`${btn} border-gray-300 bg-white text-gray-700 hover:bg-gray-100`}>
                                <i className="fas fa-user-check text-[10px]" /> Reactivate
                              </button>
                            ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={Boolean(editing)} title={isNew ? 'Add New User Account' : `Edit ${editing?.username || ''}`} icon={isNew ? 'fa-user-plus' : 'fa-user-edit'} onClose={close} busy={busy === 'save'}>
        <form onSubmit={save} className="space-y-3">
          <div>
            <label htmlFor="u-name" className="form-label">Full Name *</label>
            <input id="u-name" required minLength={2} value={form.name} onChange={set('name')} placeholder="e.g. Capt. Rahim" className="form-input" />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label htmlFor="u-username" className="form-label">Username *</label>
              <input id="u-username" required disabled={!isNew} value={form.username} onChange={set('username')} autoComplete="off" className="form-input font-mono" />
            </div>
            <div>
              <label htmlFor="u-email" className="form-label">Email *</label>
              <input id="u-email" required type="email" value={form.email} onChange={set('email')} placeholder="name@bgb.gov.bd" className="form-input" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label htmlFor="u-role" className="form-label">Role *</label>
              <select id="u-role" value={form.role} onChange={set('role')} disabled={editing?.id === currentUser.id} className="form-input">
                {roles.map((r) => <option key={r.name}>{r.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="u-scope" className="form-label">Scope / Unit *</label>
              <select id="u-scope" value={form.scope} onChange={set('scope')} className="form-input">
                {!scopes.some((s) => s.value === form.scope) && form.scope && <option value={form.scope}>{form.scope}</option>}
                {scopes.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {isNew && (
            <div>
              <label htmlFor="u-password" className="form-label">Initial Password</label>
              <input id="u-password" type="password" value={form.password} onChange={set('password')} autoComplete="new-password" placeholder="Leave blank to generate one" className="form-input" />
              <p className="mt-1 text-[11px] text-gray-500">The user must change it at first sign-in either way.</p>
            </div>
          )}
          {!isNew && (form.role !== editing?.role || form.scope !== editing?.scope) && (
            <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
              <i className="fas fa-info-circle mr-1" />
              Changing the role or scope signs this user out everywhere.
            </p>
          )}
          <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
            <button type="button" onClick={close} disabled={busy === 'save'} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={busy === 'save'} className="btn btn-primary">
              {busy === 'save' && <i className="fas fa-spinner fa-spin" />} {isNew ? 'Create User' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(secret)} title={secret?.title || ''} icon="fa-key" onClose={() => setSecret(null)}>
        {secret && (
          <div className="space-y-4">
            <OneTimeSecret label={`Temporary password for ${secret.username}`} value={secret.password} />
            <div className="flex justify-end">
              <button type="button" onClick={() => setSecret(null)} className="btn btn-primary">
                Done
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
