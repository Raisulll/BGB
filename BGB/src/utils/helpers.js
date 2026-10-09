// ============ UTILITY HELPERS ============

export const STATUS_STYLES = {
  Draft: 'bg-gray-100 text-gray-600',
  Submitted: 'bg-blue-100 text-blue-600',
  Reviewed: 'bg-amber-100 text-amber-600',
  Verified: 'bg-emerald-100 text-emerald-600',
  Approved: 'bg-emerald-100 text-emerald-700',
  Closed: 'bg-gray-200 text-gray-700',
  Rejected: 'bg-red-100 text-red-600',
  Returned: 'bg-pink-100 text-pink-600',
};

export const SEVERITY_STYLES = {
  Low: 'bg-green-50 text-green-600',
  Medium: 'bg-yellow-50 text-yellow-600',
  High: 'bg-orange-50 text-orange-600',
  Critical: 'bg-red-50 text-red-600',
};

/** Hex colours used by charts & map markers */
export const SEVERITY_HEX = { Low: '#22c55e', Medium: '#eab308', High: '#f97316', Critical: '#ef4444' };

// Display hint only (e.g. whether to offer evidence removal). Workflow, edit and scope rules are
// decided by the server, which returns `actions` / `canEdit` on each incident.
export const isAdmin = (user) => user?.role === 'HQ Administrator';

/** Spec #29 — returns a (translated) error message, or null if the password satisfies the policy. */
export const validatePassword = (pwd, policy, t) => {
  if (pwd.length < policy.minLength) return t('password.tooShort', { n: policy.minLength });
  if (policy.requireUppercase && !/[A-Z]/.test(pwd)) return t('password.needUpper');
  if (policy.requireNumber && !/[0-9]/.test(pwd)) return t('password.needNumber');
  if (policy.requireSpecial && !/[^A-Za-z0-9]/.test(pwd)) return t('password.needSpecial');
  return null;
};

// The API sends instants as ISO-8601 UTC. BGB operates on Bangladesh Standard Time (UTC+6), so
// timestamps are shown in BST regardless of the viewer's machine settings.
const BST_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Dhaka',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function bstParts(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return null;
  return Object.fromEntries(BST_PARTS.formatToParts(d).map((p) => [p.type, p.value]));
}

/** ISO timestamp → `DD-MM-YYYY HH:MM` (BST). `withSeconds` adds `:SS`. */
export function formatDateTime(value, { withSeconds = false } = {}) {
  if (!value) return '';
  const p = bstParts(value);
  if (!p) return String(value);
  return `${p.day}-${p.month}-${p.year} ${p.hour}:${p.minute}${withSeconds ? `:${p.second}` : ''}`;
}

/** Short relative time for feeds ("5 min ago"), falling back to the full date. Pass the i18n `t`. */
export function timeAgo(value, t) {
  const ts = new Date(value).getTime();
  if (isNaN(ts)) return '';
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return t('common.justNow');
  if (mins < 60) return t('common.minAgo', { n: mins });
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return t('common.hoursAgo', { n: hrs });
  const days = Math.round(hrs / 24);
  if (days < 7) return t('common.daysAgo', { n: days });
  return formatDateTime(value);
}

export function formatDateDisplay(dateStr) {
  if (!dateStr) return '';
  const str = String(dateStr).trim();

  if (/^\d{2}-\d{2}-\d{4}/.test(str)) {
    return str;
  }

  // Full timestamp: the calendar date in Bangladesh, not the UTC date
  if (ISO_INSTANT.test(str)) {
    const p = bstParts(str);
    if (p) return `${p.day}-${p.month}-${p.year}`;
  }

  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})(.*)$/);
  if (match) {
    const [, yyyy, mm, dd, rest] = match;
    return `${dd}-${mm}-${yyyy}${rest || ''}`;
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  }

  return str;
}

/** Today's date in Bangladesh as YYYY-MM-DD (for <input type="date"> limits and defaults). */
export function todayISO() {
  const p = bstParts(new Date());
  return `${p.year}-${p.month}-${p.day}`;
}

export const formatFileSize = (bytes) =>
  bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export const fileKind = (mime = '') =>
  mime.startsWith('image') ? 'image' : mime === 'application/pdf' ? 'pdf' : mime.startsWith('video') ? 'video' : 'file';

export const FILE_ICONS = {
  image: { icon: 'fa-image', cls: 'bg-blue-100 text-blue-600' },
  pdf: { icon: 'fa-file-pdf', cls: 'bg-red-100 text-red-600' },
  video: { icon: 'fa-video', cls: 'bg-purple-100 text-purple-600' },
  file: { icon: 'fa-file', cls: 'bg-gray-100 text-gray-600' },
};

export const cn = (...classes) => classes.filter(Boolean).join(' ');
