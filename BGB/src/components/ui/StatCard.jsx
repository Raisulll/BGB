const COLORS = {
  blue: { bg: 'bg-blue-50', icon: 'text-blue-500', text: 'text-gray-800' },
  orange: { bg: 'bg-orange-50', icon: 'text-orange-500', text: 'text-orange-600' },
  yellow: { bg: 'bg-yellow-50', icon: 'text-yellow-500', text: 'text-yellow-600' },
  green: { bg: 'bg-green-50', icon: 'text-green-500', text: 'text-green-600' },
  red: { bg: 'bg-red-50', icon: 'text-red-500', text: 'text-red-600' },
};

export default function StatCard({ label, value, icon, color = 'blue' }) {
  const c = COLORS[color];
  return (
    <div className="card p-3 transition duration-300 hover:-translate-y-0.5 hover:shadow-lg sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="line-clamp-2 text-xs leading-snug text-gray-500 sm:text-sm" title={label}>
            {label}
          </p>
          <p className={`mt-0.5 text-xl font-bold sm:mt-1 sm:text-2xl ${c.text}`}>{value}</p>
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg sm:h-12 sm:w-12 sm:rounded-xl ${c.bg}`}>
          <i className={`fas ${icon} ${c.icon} text-base sm:text-xl`} />
        </div>
      </div>
    </div>
  );
}
