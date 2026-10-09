import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import NotificationsMenu from './NotificationsMenu';

function getPageDetails(pathname) {
  if (pathname === '/') return { title: 'Operational Dashboard', icon: 'fa-tachometer-alt', subtitle: 'Real-time Incident Monitoring & Overview' };
  if (pathname === '/incidents') return { title: 'Incident Management', icon: 'fa-shield-alt', subtitle: 'Comprehensive Border Incident Directory' };
  if (pathname === '/incidents/new') return { title: 'New Incident Report', icon: 'fa-plus-circle', subtitle: 'Submit New Incident Case File' };
  if (pathname.endsWith('/edit')) return { title: 'Edit Incident Report', icon: 'fa-edit', subtitle: 'Update Existing Incident Record' };
  if (pathname.startsWith('/incidents/')) return { title: 'Incident Detail', icon: 'fa-file-alt', subtitle: 'Detailed Reconnaissance & Action Logs' };
  if (pathname === '/map') return { title: 'GIS Tactical Map', icon: 'fa-map-marked-alt', subtitle: 'Geospatial Border Intelligence' };
  if (pathname === '/analytics') return { title: 'Analytics & Intelligence', icon: 'fa-chart-bar', subtitle: 'Statistical Charts & Trends Analysis' };
  if (pathname === '/reports') return { title: 'Reports & Export', icon: 'fa-file-export', subtitle: 'Generate PDF/Excel Official Documents' };
  if (pathname === '/audit') return { title: 'Audit Trail', icon: 'fa-clipboard-list', subtitle: 'System Activity Logs & History' };
  if (pathname === '/admin') return { title: 'System Administration', icon: 'fa-cogs', subtitle: 'User Roles & Security Configuration' };
  if (pathname === '/change-password') return { title: 'Account Security', icon: 'fa-key', subtitle: 'Change Your Password' };
  return { title: 'BGB BIRDS System', icon: 'fa-shield-alt', subtitle: 'Border Incident Reconnaissance & Detection System' };
}

export default function Header({ onToggleSidebar, collapsed }) {
  const { currentUser, logout } = useApp();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);
  const [timeStr, setTimeStr] = useState('');

  // Live operational clock update
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString('en-US', { hour12: false }) + ' BDT');
    };
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
    <header className="relative z-30 flex h-16 shrink-0 items-center justify-between gap-2 border-b border-slate-200/80 bg-white/95 px-3 text-slate-800 backdrop-blur-md shadow-xs sm:px-4 lg:px-6 print:hidden">
      {/* Left section: Hamburger button + Page Title + Status badge */}
      <div className="flex min-w-0 items-center gap-2 sm:gap-4">
        <button
          onClick={onToggleSidebar}
          className={`group relative flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100/90 text-slate-600 border border-slate-200/80 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 transition-all duration-200 ${
            !collapsed ? 'md:hidden' : ''
          }`}
          aria-label="Toggle navigation"
          aria-controls="sidebar"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <i className="fas fa-bars text-base transition-transform group-hover:scale-110" />
        </button>

        <div className="flex items-center gap-3 min-w-0">
          <div className="hidden sm:flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
            <i className={`fas ${page.icon} text-base`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base font-bold text-slate-900 sm:text-lg tracking-wide">{page.title}</h1>
              <span className="hidden md:inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                HQ ONLINE
              </span>
            </div>
            <p className="hidden sm:block truncate text-xs text-slate-500">{page.subtitle}</p>
          </div>
        </div>
      </div>

      {/* Right section: Operational Clock + Notifications + User Menu */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Live System Clock */}
        <div className="hidden lg:flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-1.5 border border-slate-200/80 text-xs text-slate-700 font-mono shadow-xs">
          <i className="fas fa-clock text-emerald-600 animate-pulse" />
          <span className="font-semibold tracking-wider">{timeStr}</span>
        </div>

        {/* Notifications Menu Component */}
        <NotificationsMenu />

        <div className="h-6 w-px bg-slate-200" />

        {/* User Profile Menu Trigger */}
        <div ref={userMenuRef} className="relative">
          <button
            onClick={() => setUserMenuOpen((prev) => !prev)}
            className="flex items-center gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50/80 p-1.5 pr-3 text-left transition-all hover:border-slate-300 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            aria-expanded={userMenuOpen}
            aria-label="User menu"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 font-bold text-white shadow ring-1 ring-emerald-300/40">
              <i className="fas fa-user-shield text-xs" />
            </div>
            <div className="hidden sm:block min-w-0 text-left">
              <p className="truncate text-xs font-bold text-slate-800">{currentUser?.name || 'Operator'}</p>
              <p className="truncate text-[10px] font-medium text-emerald-700">{currentUser?.role || 'User'}</p>
            </div>
            <i className={`fas fa-chevron-down text-xs text-slate-400 transition-transform ${userMenuOpen ? 'rotate-180 text-emerald-600' : ''}`} />
          </button>

          {/* User Popover Dropdown */}
          {userMenuOpen && (
            <div className="absolute right-0 top-12 z-50 w-64 animate-pop-in rounded-xl border border-slate-200 bg-white p-3 shadow-xl text-slate-800">
              <div className="border-b border-slate-100 pb-3 mb-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white font-bold shadow ring-2 ring-emerald-200">
                    <i className="fas fa-user-shield text-sm" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-900 text-sm">{currentUser?.name || 'Operator'}</p>
                    <p className="truncate text-xs text-slate-500">{currentUser?.username || 'user'}</p>
                    <span className="mt-1 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 ring-1 ring-emerald-300">
                      {currentUser?.role || 'Staff'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-1 text-xs">
                <div className="flex items-center justify-between rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-700">
                  <span className="text-slate-500">Unit / Sector:</span>
                  <span className="font-semibold text-slate-800">{currentUser?.scope || 'HQ'}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-700">
                  <span className="text-slate-500">Security Level:</span>
                  <span className="font-semibold text-emerald-700">Level 4 (CONFIDENTIAL)</span>
                </div>
              </div>

              <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-2">
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    navigate('/change-password');
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-50 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100 transition-colors"
                >
                  <i className="fas fa-key" />
                  Change Password
                </button>
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-50 py-2 text-xs font-semibold text-red-600 ring-1 ring-red-200 hover:bg-red-100 hover:text-red-700 transition-colors"
                >
                  <i className="fas fa-sign-out-alt" />
                  Sign Out from BIRDS
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
