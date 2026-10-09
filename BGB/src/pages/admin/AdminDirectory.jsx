import Card from '../../components/ui/Card';
import { DemoBadge, DemoButton, Sample } from '../../components/ui/Demo';
import { useI18n } from '../../i18n/I18nContext';

// Specs #4, #32 — AD/LDAP sign-in. BGB has not yet provided the directory details (DOUBT-002), so
// local username/password accounts are the active sign-in method. This panel shows how the
// directory connection will be configured; it is not functional in the demo version.
const FIELDS = [
  ['dir.url', 'ldaps://dc01.bgb.gov.bd:636'],
  ['dir.bindDn', 'CN=birds-svc,OU=Service Accounts,DC=bgb,DC=gov,DC=bd'],
  ['dir.baseDn', 'OU=Users,DC=bgb,DC=gov,DC=bd'],
  ['dir.filter', '(sAMAccountName={username})'],
  ['dir.groupMap', 'BIRDS-HQ-Admins → HQ Administrator'],
];

export default function AdminDirectory() {
  const { t } = useI18n();
  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-2">
          {t('dir.title')} <DemoBadge />
        </span>
      }
      icon="fa-sitemap"
      bodyClassName="space-y-3"
      className="border-violet-100"
    >
      <div className="flex items-center justify-between gap-3 rounded-md border border-bgb-200 bg-bgb-50 p-3 text-xs">
        <span className="font-bold text-bgb-900">
          <i className="fas fa-user-lock mr-2" />
          {t('dir.activeMethod')}
        </span>
        <span className="rounded-md border border-bgb-300 bg-white px-2 py-0.5 font-bold text-bgb-700">{t('dir.local')}</span>
      </div>
      <p className="text-xs text-gray-500">{t('dir.pending')}</p>
      {FIELDS.map(([key, sample]) => (
        <div key={key} className="flex flex-col gap-1 rounded-lg bg-gray-50 px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between">
          <span className="text-gray-600">{t(key)}</span>
          <Sample>{sample}</Sample>
        </div>
      ))}
      <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
        <DemoButton icon="fa-plug">{t('dir.test')}</DemoButton>
        <DemoButton icon="fa-toggle-on">{t('dir.enable')}</DemoButton>
      </div>
    </Card>
  );
}
