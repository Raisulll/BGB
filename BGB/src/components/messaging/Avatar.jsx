import { useEffect, useState } from 'react';
import { coverObjectUrl } from '../../api/messaging';
import { cn } from '../../utils/helpers';

const SIZES = { xs: 'h-7 w-7 text-[11px]', sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-12 w-12 text-base', xl: 'h-20 w-20 text-2xl' };

// Muted tints so people are told apart at a glance; never red/amber/orange (reserved for alerts)
const TINTS = ['bg-bgb-100 text-bgb-800', 'bg-sky-100 text-sky-800', 'bg-indigo-100 text-indigo-800', 'bg-teal-100 text-teal-800', 'bg-slate-200 text-slate-800', 'bg-violet-100 text-violet-800'];

const tintFor = (name) => TINTS[[...name].reduce((h, ch) => (h * 31 + ch.codePointAt(0)) >>> 0, 7) % TINTS.length];

/** A group's photo (photoUrl from the API), otherwise initials of a person or a group icon. */
export default function Avatar({ name = '', group = false, size = 'md', photoUrl = null, className }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let live = true;
    setSrc(null);
    if (photoUrl) coverObjectUrl(photoUrl).then((u) => live && setSrc(u));
    return () => {
      live = false;
    };
  }, [photoUrl]);

  if (src) return <img src={src} alt="" aria-hidden="true" className={cn('shrink-0 rounded-full object-cover', SIZES[size], className)} />;

  const initials = name
    .split(/\s+/)
    .filter((w) => /^\p{L}/u.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
  return (
    <span aria-hidden="true" className={cn('flex shrink-0 items-center justify-center rounded-full font-semibold', tintFor(name), SIZES[size], className)}>
      {group ? <i className="fas fa-users" /> : initials || <i className="fas fa-user" />}
    </span>
  );
}
