import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useToast } from '../../context/ToastContext';
import * as adminApi from '../../api/admin';
import { errorMessage } from '../../api/client';
import Card from '../../components/ui/Card';
import Toggle from '../../components/ui/Toggle';

export const MODULES = [
  { id: 'dashboard', label: 'Dashboard', icon: 'fa-tachometer-alt', description: 'Overview statistics, charts, and recent incidents' },
  { id: 'incidents', label: 'Incident List', icon: 'fa-file-alt', description: 'Browse, search and open incident records' },
  { id: 'create', label: 'Create / Edit Incident', icon: 'fa-plus-circle', description: 'File new incident reports and edit own drafts' },
  { id: 'map', label: 'GIS Map View', icon: 'fa-map-marked-alt', description: 'Interactive spatial map with GPS markers' },
  { id: 'analytics', label: 'Analytics & Charts', icon: 'fa-chart-bar', description: 'Trends, severity and sector analytics' },
  { id: 'reports', label: 'Exportable Reports', icon: 'fa-file-export', description: 'Report generator and PDF/Excel/CSV export' },
  { id: 'audit', label: 'System Audit Trail', icon: 'fa-clipboard-list', description: 'Tamper-evident log of all user activity' },
  { id: 'admin', label: 'Administration Console', icon: 'fa-cogs', description: 'Users, permissions, categories and system settings' },
];

// Spec #3 — role → page matrix stored in role_permissions. Changes apply to every session at once
// (the server invalidates its permission cache) and are audited.
export default function AdminPermissions({ matrix, onChange }) {
  const { refreshUser } = useApp();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(null);
  const { roles, permissions } = matrix;

  const handleToggle = async (role, moduleId, enabled) => {
    if (role === 'HQ Administrator' && moduleId === 'admin') {
      showToast('The HQ Administrator role always keeps the Administration console.', 'warning');
      return;
    }
    setBusy(`${role}:${moduleId}`);
    try {
      const updated = await adminApi.setPermission(role, moduleId, enabled);
      onChange(updated);
      refreshUser().catch(() => {}); // the admin's own menu may change too
      showToast(`${enabled ? 'Granted' : 'Revoked'} ${moduleId} for ${role}`, 'success');
    } catch (err) {
      showToast(errorMessage(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  const reset = async () => {
    if (!window.confirm('Reset every role to the factory default permissions?')) return;
    setBusy('reset');
    try {
      onChange(await adminApi.resetPermissions());
      refreshUser().catch(() => {});
      showToast('Permissions reset to factory defaults', 'success');
    } catch (err) {
      showToast(errorMessage(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card
      title="Role Access Control Matrix"
      icon="fa-shield-alt"
      bodyClassName="p-0"
      actions={
        <button onClick={reset} disabled={Boolean(busy)} className="btn btn-secondary text-xs">
          <i className={`fas ${busy === 'reset' ? 'fa-spinner fa-spin' : 'fa-undo'}`} /> Reset to Defaults
        </button>
      }
    >
      <div className="flex items-center gap-3 border-b border-bgb-100 bg-bgb-50/60 p-4 text-xs text-bgb-900">
        <i className="fas fa-info-circle shrink-0 text-base text-bgb-600" />
        <p>
          Grant or revoke module access per role. The server enforces these on every request; changes take effect immediately for all signed-in users and are recorded in the audit trail.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs sm:text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th className="th min-w-[200px]">System Module</th>
              {roles.map(({ name }) => (
                <th key={name} className="th min-w-[130px] whitespace-nowrap text-center">
                  <span className="block font-semibold text-gray-800">{name}</span>
                  <span className="block text-[10px] font-normal text-gray-500">
                    {(permissions[name] || []).length} / {MODULES.length} modules
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {MODULES.map((mod) => (
              <tr key={mod.id} className="transition-colors hover:bg-gray-50/80">
                <td className="td">
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bgb-50 text-bgb-700">
                      <i className={`fas ${mod.icon}`} />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800">{mod.label}</p>
                      <p className="text-xs text-gray-500">{mod.description}</p>
                    </div>
                  </div>
                </td>
                {roles.map(({ name }) => {
                  const isAllowed = (permissions[name] || []).includes(mod.id);
                  const isLocked = name === 'HQ Administrator' && mod.id === 'admin';
                  const key = `${name}:${mod.id}`;
                  return (
                    <td key={name} className="td text-center">
                      <div className={`inline-flex items-center justify-center ${busy === key ? 'opacity-50' : ''}`}>
                        <Toggle checked={isAllowed} onChange={() => !busy && handleToggle(name, mod.id, !isAllowed)} label={`Toggle ${mod.label} for ${name}`} />
                      </div>
                      {isLocked && <span className="mt-1 block text-[9px] font-semibold text-amber-600">LOCKED</span>}
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
