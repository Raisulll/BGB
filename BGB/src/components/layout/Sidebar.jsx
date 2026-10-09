import { Link, useLocation } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { cn } from '../../utils/helpers';

const NAV_ITEMS = [
  { id: 'dashboard', to: '/', icon: 'fa-tachometer-alt', label: 'Dashboard', match: (p) => p === '/' },
  { id: 'incidents', to: '/incidents', icon: 'fa-shield-alt', label: 'Incidents', match: (p) => p.startsWith('/incidents') && p !== '/incidents/new' },
  { id: 'create', to: '/incidents/new', icon: 'fa-plus-circle', label: 'New Incident', match: (p) => p === '/incidents/new', tag: 'NEW' },
  { id: 'map', to: '/map', icon: 'fa-map-marked-alt', label: 'GIS Map View', tag: 'LIVE' },
  { id: 'analytics', to: '/analytics', icon: 'fa-chart-bar', label: 'Analytics' },
  { id: 'reports', to: '/reports', icon: 'fa-file-export', label: 'Reports' },
  { id: 'audit', to: '/audit', icon: 'fa-clipboard-list', label: 'Audit Trail' },
  { id: 'admin', to: '/admin', icon: 'fa-cogs', label: 'Administration' },
];

export default function Sidebar({ mobileOpen, collapsed, onClose, onToggleCollapse }) {
  const { currentUser, hasPermission } = useApp();
  const { pathname } = useLocation();
  const hideOnDesktop = collapsed ? 'md:hidden' : '';

  // Nothing but the password form is reachable until a required change is done (spec #29)
  const allowedItems = currentUser?.mustChangePassword ? [] : NAV_ITEMS.filter((item) => hasPermission(currentUser, item.id));

  return (
    <aside
      id="sidebar"
      aria-label="Main navigation"
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
        <Link to="/" className="flex items-center gap-2 min-w-0" title="BGB BIRDS System">
          <div
            className={cn(
              'relative flex shrink-0 items-center justify-center rounded-xl bg-emerald-50/80 shadow-sm border border-emerald-200/80 transition-all',
              collapsed ? 'h-9 w-9 p-1' : 'h-10 w-10 p-1.5',
            )}
          >
            <img src="/bgb.png" alt="BGB Logo" className="h-full w-auto object-contain" />
            <span className="absolute -right-0.5 -top-0.5 flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
            </span>
          </div>
          <div className={cn('min-w-0', hideOnDesktop)}>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold tracking-wider text-slate-900 text-base">BIRDS</span>
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold tracking-widest text-emerald-800 ring-1 ring-emerald-300/60 uppercase">
                v2.4
              </span>
            </div>
            <p className="truncate text-[11px] font-medium text-slate-500">Border Recon & Incidents</p>
          </div>
        </Link>

        {/* Collapse toggle icon button (Desktop) */}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className={cn(
              'hidden md:flex shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 transition-all duration-200 border border-slate-200/80 shadow-xs',
              collapsed ? 'h-7 w-7 text-[10px]' : 'h-8 w-8 text-xs',
            )}
            title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <i className={cn('fas transition-transform duration-200', collapsed ? 'fa-chevron-right' : 'fa-chevron-left')} />
          </button>
        )}

        {/* Close Button (Mobile) */}
        <button
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 md:hidden"
          aria-label="Close menu"
        >
          <i className="fas fa-times text-base" />
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 space-y-1.5 overflow-y-auto p-3 scrollbar-none">
        <div className={cn('px-2 py-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase', hideOnDesktop)}>
          Navigation Menu
        </div>
        {allowedItems.map((item) => {
          const active = item.match ? item.match(pathname) : pathname.startsWith(item.to);

          return (
            <Link
              key={item.to}
              to={item.to}
              title={collapsed ? item.label : undefined}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'group relative flex min-h-11 items-center gap-3.5 rounded-xl px-3 text-sm font-medium transition-all duration-200 md:min-h-10',
                collapsed && 'md:justify-center md:px-0',
                active
                  ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-md shadow-emerald-600/25 font-semibold'
                  : 'text-slate-600 hover:bg-emerald-50/80 hover:text-emerald-700',
              )}
            >
              {/* Active bar */}
              {active && (
                <span className="absolute left-0 top-2 bottom-2 w-1.5 rounded-r-full bg-emerald-800 shadow-sm" />
              )}

              <i
                className={cn(
                  `fas ${item.icon} w-5 text-center text-base transition-transform duration-200 group-hover:scale-110`,
                  active ? 'text-white' : 'text-slate-500 group-hover:text-emerald-700',
                )}
              />

              <span className={cn('truncate flex-1 font-semibold tracking-wide', hideOnDesktop)}>
                {item.label}
              </span>

              {/* Badges / Tags */}
              {!collapsed && item.tag && (
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase ring-1',
                    item.tag === 'LIVE'
                      ? 'bg-red-100 text-red-700 ring-red-300 animate-pulse'
                      : 'bg-emerald-100 text-emerald-800 ring-emerald-300',
                  )}
                >
                  {item.tag}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer / User Profile Panel */}
      <div className="shrink-0 border-t border-slate-100 p-3 bg-slate-50/60">
        <div
          className={cn(
            'flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-2.5 shadow-sm transition-colors hover:border-slate-300',
            collapsed && 'md:justify-center md:border-none md:bg-transparent md:p-0',
          )}
        >
          <div
            className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 font-bold text-white shadow ring-2 ring-emerald-200"
            title={collapsed ? `${currentUser?.name || 'User'} (${currentUser?.role || ''})` : undefined}
          >
            <i className="fas fa-user-shield text-sm" />
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
          </div>

          <div className={cn('min-w-0 flex-1', hideOnDesktop)}>
            <p className="truncate text-xs font-bold text-slate-800">{currentUser?.name || 'Operator'}</p>
            <p className="truncate text-[11px] font-medium text-emerald-700">{currentUser?.role || 'BGB HQ'}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
