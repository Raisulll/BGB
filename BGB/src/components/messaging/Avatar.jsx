import { cn } from '../../utils/helpers';

const SIZES = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-12 w-12 text-base' };

/** Initials of a person, or a group icon. Neutral colours only. */
export default function Avatar({ name = '', group = false, size = 'md', className }) {
  const initials = name
    .split(/\s+/)
    .filter((w) => /^\p{L}/u.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
  return (
    <span
      aria-hidden="true"
      className={cn('flex shrink-0 items-center justify-center rounded-full border border-slate-300 bg-slate-100 font-semibold text-slate-700', SIZES[size], className)}
    >
      {group ? <i className="fas fa-users" /> : initials || <i className="fas fa-user" />}
    </span>
  );
}
