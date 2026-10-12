import { DemoBadge, DemoButton, Sample } from '../../components/ui/Demo';
import { useI18n } from '../../i18n/I18nContext';
import { InfoRow, SettingsSection, StatusText } from './SettingsParts';

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

export default function AdminDirectory({ id }) {
  const { t } = useI18n();
  return (
    <SettingsSection
      id={id}
      title={
        <span className="flex flex-wrap items-center gap-2">
          {t('dir.title')} <DemoBadge />
        </span>
      }
      icon="fa-sitemap"
      description={t('dir.pending')}
      footer={
        <>
          <DemoButton icon="fa-plug" className="btn-secondary btn-sm">{t('dir.test')}</DemoButton>
          <DemoButton icon="fa-toggle-on" className="btn-secondary btn-sm">{t('dir.enable')}</DemoButton>
        </>
      }
    >
      <InfoRow label={t('dir.activeMethod')}>
        <StatusText tone="ok">{t('dir.local')}</StatusText>
      </InfoRow>
      {FIELDS.map(([key, sample]) => (
        <InfoRow key={key} label={t(key)}>
          <span className="break-all">
            <Sample>{sample}</Sample>
          </span>
        </InfoRow>
      ))}
    </SettingsSection>
  );
}
