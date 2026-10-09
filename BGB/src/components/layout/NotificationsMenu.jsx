import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { formatDateTime, timeAgo } from '../../utils/helpers';

const TYPE_ICON = {
  submission: 'fa-paper-plane text-blue-600 bg-blue-50 border-blue-200',
  review: 'fa-search text-amber-600 bg-amber-50 border-amber-200',
  approval: 'fa-check-circle text-emerald-600 bg-emerald-50 border-emerald-200',
  return: 'fa-undo text-purple-600 bg-purple-50 border-purple-200',
};

export default function NotificationsMenu() {
  const { notifications = [], unreadCount, markAllRead, markRead } = useApp();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('all'); // 'all' | 'unread'
  const ref = useRef(null);
  const navigate = useNavigate();

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const displayedNotifications = notifications.filter((n) => {
    if (filter === 'unread') return !n.read;
    return true;
  });

  const handleItemClick = (n) => {
    setOpen(false);
    if (!n.read) markRead(n.id);
    navigate(n.incidentId ? `/incidents/${n.incidentId}` : '/incidents');
  };

  return (
    <div ref={ref} className="sm:relative">
      {/* Bell Trigger Button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100/90 text-slate-600 border border-slate-200/80 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 transition-all duration-200"
        aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ''}`}
        aria-expanded={open}
        title="Notifications Center"
      >
        <i className="fas fa-bell text-base" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-sm animate-pulse">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Popover Dropdown Card */}
      {open && (
        <div className="absolute inset-x-2 top-14 z-50 flex max-h-[75vh] flex-col animate-pop-in overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-2xl sm:inset-x-auto sm:right-0 sm:top-12 sm:w-96">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/90 px-4 py-3">
            <div className="flex items-center gap-2">
              <i className="fas fa-bell text-emerald-600 text-sm" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-800">Notifications</span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200">
                  {unreadCount} New
                </span>
              )}
            </div>
            <button
              onClick={markAllRead}
              className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 hover:underline disabled:opacity-40"
              disabled={!unreadCount}
            >
              Mark all read
            </button>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1 border-b border-slate-100 bg-slate-50/50 px-3 py-1.5 text-xs font-medium">
            <button
              onClick={() => setFilter('all')}
              className={`rounded-lg px-2.5 py-1 transition-colors ${
                filter === 'all' ? 'bg-white font-bold text-slate-900 shadow-xs border border-slate-200' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`rounded-lg px-2.5 py-1 transition-colors ${
                filter === 'unread' ? 'bg-white font-bold text-emerald-700 shadow-xs border border-slate-200' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Unread ({unreadCount})
            </button>
          </div>

          {/* Notifications List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 scrollbar-none">
            {displayedNotifications.length === 0 ? (
              <div className="p-8 text-center">
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                  <i className="fas fa-bell-slash text-base" />
                </div>
                <p className="text-xs font-semibold text-slate-600">No notifications</p>
                <p className="mt-1 text-[11px] text-slate-400">All notifications have been reviewed.</p>
              </div>
            ) : (
              displayedNotifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleItemClick(n)}
                  className={`group flex items-start gap-3 p-3.5 transition-colors cursor-pointer hover:bg-slate-50 ${
                    !n.read ? 'bg-emerald-50/30' : 'bg-white'
                  }`}
                >
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border text-xs shadow-2xs ${TYPE_ICON[n.type] || TYPE_ICON.review}`}>
                    <i className={`fas ${TYPE_ICON[n.type]?.split(' ')[0] || 'fa-bell'}`} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-900 group-hover:text-emerald-800">{n.title}</p>
                    <p className="mt-0.5 text-xs text-slate-600 line-clamp-2">{n.message}</p>
                    <p className="mt-1 text-[10px] font-medium text-slate-400" title={formatDateTime(n.createdAt)}>
                      {timeAgo(n.createdAt)}
                    </p>
                  </div>

                  {!n.read && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500 ring-2 ring-emerald-200" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
