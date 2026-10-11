import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import useIdleLogout from '../../hooks/useIdleLogout';
import useOnline from '../../hooks/useOnline';
import { useApp } from '../../context/AppContext';
import { PushPrompt } from '../messaging/PushSettings';
import { useI18n } from '../../i18n/I18nContext';
import { CommsProvider } from '../../context/CommsContext';

const DESKTOP_QUERY = '(min-width: 768px)';

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { pathname } = useLocation();
  const { t } = useI18n();
  const online = useOnline();
  const { currentUser, hasPermission } = useApp();
  useIdleLogout();

  // Close mobile drawer & scroll to top on navigation
  useEffect(() => {
    setMobileOpen(false);
    document.getElementById('main-scroll')?.scrollTo(0, 0);
  }, [pathname]);

  // Close drawer with Escape
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e) => e.key === 'Escape' && setMobileOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  const toggleSidebar = () => {
    if (window.matchMedia(DESKTOP_QUERY).matches) setCollapsed((c) => !c);
    else setMobileOpen((o) => !o);
  };

  const toggleCollapseOnly = () => {
    setCollapsed((c) => !c);
  };

  return (
    <CommsProvider>
      {/* Safe-area padding: the installed app runs full screen under the iPhone notch and home bar */}
      <div className="flex h-dvh overflow-hidden bg-slate-100/60 pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]">
        {/* Mobile overlay */}
        <div
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
          className={`fixed inset-0 z-40 bg-slate-950/70 transition-opacity md:hidden ${
            mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        />

        <Sidebar
          mobileOpen={mobileOpen}
          collapsed={collapsed}
          onClose={() => setMobileOpen(false)}
          onToggleCollapse={toggleCollapseOnly}
        />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Header onToggleSidebar={toggleSidebar} collapsed={collapsed} />
          {!online && (
            <p role="status" className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 print:hidden">
              <i className="fas fa-wifi mr-2" aria-hidden="true" />
              {t('pwa.offline')}
            </p>
          )}
          <main id="main-scroll" className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6 print:overflow-visible print:p-0">
            {/* Calls and messages reach this device only once notifications are on (shown on every page until done or dismissed) */}
            {hasPermission(currentUser, 'messages') && (
              <div className="mx-auto mb-3 w-full max-w-screen-2xl print:hidden">
                <PushPrompt />
              </div>
            )}
            <div key={pathname} className="mx-auto w-full max-w-screen-2xl animate-fade-in">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </CommsProvider>
  );
}
