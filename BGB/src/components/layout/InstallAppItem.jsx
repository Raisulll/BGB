import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/I18nContext';
import { installMode, onInstallChange, promptInstall } from '../../utils/pwa';
import Modal from '../ui/Modal';

/**
 * "Install app" in the user menu (specs #41, #58). Android/desktop Chrome and Edge show the
 * browser's install dialog; iPhone/iPad get the Share-menu steps (onIosHelp). Hidden once installed.
 */
export default function InstallAppItem({ onDone, onIosHelp }) {
  const { t } = useI18n();
  const [mode, setMode] = useState(installMode);
  useEffect(() => onInstallChange(() => setMode(installMode())), []);
  if (!mode) return null;

  const click = async () => {
    onDone();
    if (mode === 'ios') onIosHelp();
    else await promptInstall();
  };

  return (
    <button role="menuitem" onClick={click} className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
      {t('pwa.install')}
    </button>
  );
}

/** How to add the app to the home screen on iPhone/iPad (Safari has no install dialog). */
export function IosInstallHelp({ onClose }) {
  const { t } = useI18n();
  return (
    <Modal open title={t('pwa.iosTitle')} icon="fa-mobile-screen-button" onClose={onClose}>
      <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-800">
        <li>
          {t('pwa.iosStep1')} <i className="fas fa-arrow-up-from-bracket mx-1 text-slate-600" aria-hidden="true" />
        </li>
        <li>{t('pwa.iosStep2')}</li>
        <li>{t('pwa.iosStep3')}</li>
      </ol>
      <p className="mt-3 text-xs text-slate-500">{t('pwa.iosNote')}</p>
      <div className="mt-4 flex justify-end">
        <button type="button" onClick={onClose} className="btn btn-primary">
          {t('common.close')}
        </button>
      </div>
    </Modal>
  );
}
