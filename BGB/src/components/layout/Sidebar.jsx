import { Link, useLocation } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useComms } from '../../context/CommsContext';
import { cn } from '../../utils/helpers';
import { useI18n } from '../../i18n/I18nContext';

const NAV_ITEMS = [
  { id: 'dashboard', to: '/', icon: 'fa-tachometer-alt', match: (p) => p === '/' },
  { id: 'incidents', to: '/incidents', icon: 'fa-shield-alt', match: (p) => p.startsWith('/incidents') && p !== '/incidents/new' },
  { id: 'create', to: '/incidents/new', icon: 'fa-plus-circle', match: (p) => p === '/incidents/new' },
  { id: 'map', to: '/map', icon: 'fa-map-marked-alt' },
  { id: 'analytics', to: '/analytics', icon: 'fa-chart-bar' },
  { id: 'reports', to: '/reports', icon: 'fa-file-export' },
  { id: 'messages', to: '/messages', icon: 'fa-comments', badge: 'unread' },
  { id: 'calls', perm: 'messages', to: '/calls', icon: 'fa-phone' },
  { id: 'audit', to: '/audit', icon: 'fa-clipboard-list' },
  { id: 'admin', to: '/admin', icon: 'fa-cogs' },
];

export default function Sidebar({ mobileOpen, collapsed, onClose, onToggleCollapse }) {
  const { currentUser, hasPermission } = useApp();
  const { unread } = useComms();
  const { t } = useI18n();
  const { pathname } = useLocation();
  const hideOnDesktop = collapsed ? 'md:hidden' : '';

  // Nothing but the password form is reachable until a required change is done (spec #29)
  const allowedItems = currentUser?.mustChangePassword ? [] : NAV_ITEMS.filter((item) => hasPermission(currentUser, item.perm || item.id));

  return (
    <aside
      id="sidebar"
      aria-label={t('nav.mainNav')}
      className={cn(
        'fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-slate-200/80 bg-white text-slate-800 shadow-xl transition-all duration-300',
        'md:static md:z-auto md:max-w-none md:translate-x-0 md:shadow-none print:hidden',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
        collapsed ? 'md:w-20' : 'md:w-64',
      )}
    >
      {/* Brand Header */}
      <div
        className={cn(
          'flex h-16 shrink-0 items-center justify-between border-b border-slate-100 px-3 sm:px-4',
          collapsed && 'md:px-2 md:justify-center md:gap-1.5',
        )}
      >
        <Link to="/" className="flex items-center gap-2 min-w-0" title={t('page.default.title')}>
          <img src="/bgb.png" alt={t('nav.crestAlt')} className={cn('shrink-0 object-contain', collapsed ? 'h-9 w-9' : 'h-10 w-10')} />
          <div className={cn('min-w-0', hideOnDesktop)}>
            <p className="text-base font-semibold leading-tight text-slate-900">BIRDS</p>
            <p className="truncate text-xs text-slate-600">{t('nav.brandSub')}</p>
          </div>
        </Link>

        {/* Collapse toggle icon button (Desktop) */}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className={cn(
              'hidden md:flex shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bgb-700',
              collapsed ? 'h-7 w-7 text-xs' : 'h-8 w-8 text-xs',
            )}
            title={collapsed ? t('header.expandSidebar') : t('header.collapseSidebar')}
            aria-label={collapsed ? t('header.expandSidebar') : t('header.collapseSidebar')}
          >
            <i className={cn('fas transition-transform duration-200', collapsed ? 'fa-chevron-right' : 'fa-chevron-left')} />
          </button>
        )}

        {/* Close Button (Mobile) */}
        <button
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 md:hidden"
          aria-label={t('nav.closeMenu')}
        >
          <i className="fas fa-times text-base" />
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {allowedItems.map((item) => {
          const active = item.match ? item.match(pathname) : pathname.startsWith(item.to);
          const count = item.badge === 'unread' ? unread : 0;

          return (
            <Link
              key={item.to}
              to={item.to}
              title={collapsed ? t(`nav.${item.id}`) : undefined}
              aria-label={count ? `${t(`nav.${item.id}`)}, ${t('msg.unreadCount', { n: count })}` : undefined}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors md:min-h-10',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bgb-700 focus-visible:ring-offset-1',
                collapsed && 'md:justify-center md:px-0',
                active ? 'bg-bgb-700 text-white' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900',
              )}
            >
              <span className="relative">
                <i className={cn(`fas ${item.icon} w-5 text-center`, active ? 'text-white' : 'text-slate-500')} aria-hidden="true" />
                {count > 0 && collapsed && <span className="absolute -right-1 -top-1 hidden h-2 w-2 rounded-full bg-red-600 md:block" aria-hidden="true" />}
              </span>
              <span className={cn('flex-1 truncate', hideOnDesktop)}>{t(`nav.${item.id}`)}</span>
              {count > 0 && (
                <span
                  className={cn('rounded-full px-1.5 text-xs font-semibold', active ? 'bg-white text-bgb-800' : 'bg-red-600 text-white', hideOnDesktop)}
                  aria-hidden="true"
                >
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className={cn('shrink-0 border-t border-slate-200 px-4 py-3 text-xs text-slate-500', hideOnDesktop)}>
        <p>{t('nav.org')}</p>
        <p>{t('nav.version', { v: '2.4' })}</p>
      </div>
    </aside>
  );
}
