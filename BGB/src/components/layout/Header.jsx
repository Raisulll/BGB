import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import GlobalSearch from './GlobalSearch';
import NotificationsMenu from './NotificationsMenu';
import LanguageSwitcher from './LanguageSwitcher';
import InstallAppItem, { IosInstallHelp } from './InstallAppItem';
import { useI18n } from '../../i18n/I18nContext';

function getPageDetails(pathname) {
  if (pathname === '/') return { key: 'dashboard', icon: 'fa-tachometer-alt' };
  if (pathname === '/incidents') return { key: 'incidents', icon: 'fa-shield-alt' };
  if (pathname === '/incidents/new') return { key: 'new', icon: 'fa-plus-circle' };
  if (pathname.endsWith('/edit')) return { key: 'edit', icon: 'fa-edit' };
  if (pathname.startsWith('/incidents/')) return { key: 'detail', icon: 'fa-file-alt' };
  if (pathname === '/map') return { key: 'map', icon: 'fa-map-marked-alt' };
  if (pathname === '/analytics') return { key: 'analytics', icon: 'fa-chart-bar' };
  if (pathname === '/reports') return { key: 'reports', icon: 'fa-file-export' };
  if (pathname === '/audit') return { key: 'audit', icon: 'fa-clipboard-list' };
  if (pathname === '/admin') return { key: 'admin', icon: 'fa-cogs' };
  if (pathname === '/change-password') return { key: 'password', icon: 'fa-key' };
  if (pathname === '/profile') return { key: 'profile', icon: 'fa-id-badge' };
  if (pathname.startsWith('/messages')) return { key: 'messages', icon: 'fa-comments' };
  if (pathname === '/calls') return { key: 'calls', icon: 'fa-phone' };
  if (pathname === '/alerts') return { key: 'alerts', icon: 'fa-triangle-exclamation' };
  if (pathname === '/alerts/new') return { key: 'alertNew', icon: 'fa-triangle-exclamation' };
  if (pathname.startsWith('/alerts/')) return { key: 'alertDetail', icon: 'fa-triangle-exclamation' };
  return { key: 'default', icon: 'fa-shield-alt' };
}

// The operations clock always shows Bangladesh Standard Time, whatever the workstation's zone
const BST_CLOCK = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

export default function Header({ onToggleSidebar, collapsed }) {
  const { currentUser, logout, hasPermission } = useApp();
  const { t, tv } = useI18n();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);
  const userMenuRef = useRef(null);
  const [timeStr, setTimeStr] = useState('');

  // Live operational clock update
  useEffect(() => {
    const updateTime = () => setTimeStr(BST_CLOCK.format(new Date()));
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Close user menu on click outside
  useEffect(() => {
    if (!userMenuOpen) return;
    const handleClick = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [userMenuOpen]);

  const handleLogout = async () => {
    setUserMenuOpen(false);
    await logout();
    navigate('/login', { replace: true });
  };

  const page = getPageDetails(pathname);

  return (
    <header className="relative z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 text-slate-800 sm:px-4 lg:px-6 print:hidden">
      {/* Left: menu button + page title */}
      <div className="flex min-w-0 items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bgb-700 ${
            !collapsed ? 'md:hidden' : ''
          }`}
          aria-label={t('header.toggleNav')}
          aria-controls="sidebar"
          title={collapsed ? t('header.expandSidebar') : t('header.collapseSidebar')}
        >
          <i className="fas fa-bars" aria-hidden="true" />
        </button>
        <h1 className="truncate text-lg font-semibold text-slate-900">{t(`page.${page.key}.title`)}</h1>
      </div>

      {/* Right: search, clock, language, notifications, user menu */}
      <div className="flex items-center gap-2 sm:gap-3">
        {hasPermission(null, 'incidents') && <GlobalSearch />}

        {/* Operations clock, always Bangladesh Standard Time */}
        <span className="hidden whitespace-nowrap text-sm tabular-nums text-slate-600 2xl:inline">
          {timeStr} {t('header.bst')}
        </span>

        <div className="hidden sm:block">
          <LanguageSwitcher />
        </div>

        <NotificationsMenu />

        <div ref={userMenuRef} className="relative">
          <button
            onClick={() => setUserMenuOpen((prev) => !prev)}
            className="flex items-center gap-2.5 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bgb-700"
            aria-expanded={userMenuOpen}
            aria-label={t('header.userMenu')}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
              <i className="fas fa-user text-xs" aria-hidden="true" />
            </span>
            <span className="hidden min-w-0 sm:block">
              <span className="block truncate text-sm font-medium text-slate-900">{currentUser?.name}</span>
              <span className="block truncate text-xs text-slate-600">{tv('role', currentUser?.role)}</span>
            </span>
            <i className={`fas fa-chevron-down text-xs text-slate-500 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 top-12 z-50 w-64 rounded-md border border-slate-200 bg-white py-2 text-slate-800 shadow-lg" role="menu">
              <div className="border-b border-slate-200 px-4 pb-3">
                <p className="truncate text-sm font-semibold text-slate-900">{currentUser?.name}</p>
                <p className="truncate text-xs text-slate-600">
                  {currentUser?.username} · {tv('role', currentUser?.role)}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  {t('header.unit')}: <span className="font-medium text-slate-800">{currentUser?.scope}</span>
                </p>
                <div className="mt-2 sm:hidden">
                  <LanguageSwitcher />
                </div>
              </div>
              <button
                id="menu-profile"
                role="menuitem"
                onClick={() => {
                  setUserMenuOpen(false);
                  navigate('/profile');
                }}
                className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                {t('header.profile')}
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setUserMenuOpen(false);
                  navigate('/change-password');
                }}
                className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                {t('header.changePassword')}
              </button>
              <InstallAppItem onDone={() => setUserMenuOpen(false)} onIosHelp={() => setIosHelp(true)} />
              <div className="my-1 border-t border-slate-200" />
              <button role="menuitem" onClick={handleLogout} className="block w-full px-4 py-2 text-left text-sm font-medium text-red-700 hover:bg-red-50">
                {t('header.signOut')}
              </button>
            </div>
          )}
        </div>
      </div>
      {iosHelp && <IosInstallHelp onClose={() => setIosHelp(false)} />}
    </header>
  );
}
