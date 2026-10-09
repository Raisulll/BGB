import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useToast } from '../../context/ToastContext';
import * as adminApi from '../../api/admin';
import { errorMessage } from '../../api/client';
import Card from '../../components/ui/Card';
import { useI18n } from '../../i18n/I18nContext';

export const MODULES = [
  { id: 'dashboard', icon: 'fa-tachometer-alt' },
  { id: 'incidents', icon: 'fa-file-alt' },
  { id: 'create', icon: 'fa-plus-circle' },
  { id: 'map', icon: 'fa-map-marked-alt' },
  { id: 'analytics', icon: 'fa-chart-bar' },
  { id: 'reports', icon: 'fa-file-export' },
  { id: 'audit', icon: 'fa-clipboard-list' },
  { id: 'admin', icon: 'fa-cogs' },
  { id: 'messages', icon: 'fa-comments' },
];

// Spec #3 — role → page matrix stored in role_permissions. Changes apply to every session at once
// (the server invalidates its permission cache) and are audited.
export default function AdminPermissions({ matrix, onChange }) {
  const { refreshUser } = useApp();
  const { showToast } = useToast();
  const { t, tv } = useI18n();
  const [busy, setBusy] = useState(null);
  const { roles, permissions } = matrix;

  const handleToggle = async (role, moduleId, enabled) => {
    if (role === 'HQ Administrator' && moduleId === 'admin') {
      showToast(t('perm.adminLocked'), 'warning');
      return;
    }
    setBusy(`${role}:${moduleId}`);
    try {
      const updated = await adminApi.setPermission(role, moduleId, enabled);
      onChange(updated);
      refreshUser().catch(() => {}); // the admin's own menu may change too
      showToast(t(enabled ? 'perm.granted' : 'perm.revoked', { module: t(`perm.module.${moduleId}`), role: tv('role', role) }), 'success');
    } catch (err) {
      showToast(errorMessage(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  const reset = async () => {
    if (!window.confirm(t('perm.confirmReset'))) return;
    setBusy('reset');
    try {
      onChange(await adminApi.resetPermissions());
      refreshUser().catch(() => {});
      showToast(t('perm.resetDone'), 'success');
    } catch (err) {
      showToast(errorMessage(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card
      title={t('perm.title')}
      icon="fa-shield-alt"
      bodyClassName="p-0"
      actions={
        <button onClick={reset} disabled={Boolean(busy)} className="btn btn-secondary text-xs">
          <i className={`fas ${busy === 'reset' ? 'fa-spinner fa-spin' : 'fa-undo'}`} /> {t('perm.reset')}
        </button>
      }
    >
      <div className="flex items-center gap-3 border-b border-bgb-100 bg-bgb-50/60 p-4 text-xs text-bgb-900">
        <i className="fas fa-info-circle shrink-0 text-base text-bgb-600" />
        <p>
          {t('perm.info')}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs sm:text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th className="th min-w-[200px]">{t('perm.moduleHeader')}</th>
              {roles.map(({ name }) => (
                <th key={name} className="th min-w-[130px] whitespace-nowrap text-center">
                  <span className="block font-semibold text-gray-800">{tv('role', name)}</span>
                  <span className="block text-xs font-normal text-gray-500">
                    {t('perm.modulesCount', { n: (permissions[name] || []).length, total: MODULES.length })}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {MODULES.map((mod) => (
              <tr key={mod.id} className="transition-colors hover:bg-gray-50/80">
                <td className="td">
                  <p className="font-medium text-slate-900">{t(`perm.module.${mod.id}`)}</p>
                  <p className="text-xs text-slate-600">{t(`perm.desc.${mod.id}`)}</p>
                </td>
                {roles.map(({ name }) => {
                  const isAllowed = (permissions[name] || []).includes(mod.id);
                  const isLocked = name === 'HQ Administrator' && mod.id === 'admin';
                  const key = `${name}:${mod.id}`;
                  return (
                    <td key={name} className="td text-center">
                      <input
                        type="checkbox"
                        checked={isAllowed}
                        disabled={Boolean(busy) || isLocked}
                        onChange={() => handleToggle(name, mod.id, !isAllowed)}
                        aria-label={t('perm.toggle', { module: t(`perm.module.${mod.id}`), role: tv('role', name) })}
                        className={`h-5 w-5 cursor-pointer accent-bgb-700 disabled:cursor-not-allowed ${busy === key ? 'opacity-50' : ''}`}
                      />
                      {isLocked && <span className="mt-1 block text-xs text-slate-600">{t('perm.locked')}</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
