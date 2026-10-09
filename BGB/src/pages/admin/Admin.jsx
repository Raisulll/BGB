import { useState } from 'react';
import * as adminApi from '../../api/admin';
import useApi from '../../hooks/useApi';
import Card from '../../components/ui/Card';
import ErrorState from '../../components/ui/ErrorState';
import Spinner from '../../components/ui/Spinner';
import { DemoBadge } from '../../components/ui/Demo';
import AdminUsers from './AdminUsers';
import AdminPermissions from './AdminPermissions';
import AdminCategories from './AdminCategories';
import AdminOrg from './AdminOrg';
import AdminWorkflow from './AdminWorkflow';
import AdminSettings from './AdminSettings';
import AdminOperations from './AdminOperations';
import { useI18n } from '../../i18n/I18nContext';

// Spec #46 — administrative module. Every change goes through /api/v1/admin or /api/v1/users,
// is validated and audited by the server.
const TABS = [
  { id: 'users', icon: 'fa-users' },
  { id: 'permissions', icon: 'fa-shield-alt' },
  { id: 'categories', icon: 'fa-tags' },
  { id: 'org', icon: 'fa-sitemap' },
  { id: 'workflow', icon: 'fa-project-diagram' },
  { id: 'settings', icon: 'fa-lock' },
  { id: 'operations', icon: 'fa-server', demo: true },
];

async function loadAdmin() {
  const [permissions, org, config] = await Promise.all([adminApi.getPermissions(), adminApi.getOrgHierarchy(), adminApi.getConfig()]);
  return { permissions, org, config };
}

export default function Admin() {
  const [tab, setTab] = useState('users');
  const { t } = useI18n();
  const { data, error, message, reload, setData } = useApi(loadAdmin, []);

  if (error) return <Card><ErrorState message={message} onRetry={reload} /></Card>;
  if (!data) return <Spinner />;

  const update = (key) => (value) => setData((d) => ({ ...d, [key]: value }));
  const { permissions, org, config } = data;
  const grants = Object.values(permissions.permissions).reduce((n, list) => n + list.length, 0);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          [t('admin.kpi.roles'), permissions.roles.length, 'text-slate-900'],
          [t('admin.kpi.grants'), `${grants} / ${permissions.roles.length * permissions.pageIds.length}`, 'text-slate-900'],
          [t('admin.kpi.units'), t('admin.kpi.unitsValue', { s: Object.keys(org.hierarchy).length, b: org.units.length }), 'text-slate-900'],
          [t('admin.kpi.timeout'), t('admin.kpi.minutes', { n: config.find((c) => c.key === 'session.timeout_minutes')?.value ?? '–' }), 'text-slate-900'],
        ].map(([label, value, cls]) => (
          <div key={label} className="card p-3 sm:p-4">
            <p className="text-sm text-slate-600">{label}</p>
            <p className={`mt-1 text-lg font-semibold tabular-nums sm:text-xl ${cls}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-300" role="tablist">
        {TABS.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bgb-700 ${
              tab === item.id ? 'border-bgb-700 text-bgb-800' : 'border-transparent text-slate-600 hover:border-slate-400 hover:text-slate-900'
            }`}
          >
            {t(`admin.tab.${item.id}`)}
            {item.demo && <DemoBadge />}
          </button>
        ))}
      </div>

      <div>
        {tab === 'users' && <AdminUsers roles={permissions.roles} hierarchy={org.hierarchy} />}
        {tab === 'permissions' && <AdminPermissions matrix={permissions} onChange={update('permissions')} />}
        {tab === 'categories' && <AdminCategories />}
        {tab === 'org' && <AdminOrg org={org} onChange={update('org')} />}
        {tab === 'workflow' && <AdminWorkflow />}
        {tab === 'settings' && <AdminSettings config={config} onChange={update('config')} />}
        {tab === 'operations' && <AdminOperations config={config} onChange={update('config')} />}
      </div>
    </div>
  );
}
