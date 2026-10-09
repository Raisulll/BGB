// One stat card style for every page: white surface, sentence-case label, neutral figure. Colour
// only for exceptions: `alert` turns the figure red when it is above zero. `icon`/`color` are
// accepted for older callers and ignored.
export default function StatCard({ label, value, note, alert = false }) {
  const flagged = alert && Number(value) > 0;
  return (
    <div className="card p-4 sm:p-5">
      <p className="text-sm text-slate-600">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums sm:text-3xl ${flagged ? 'text-red-700' : 'text-slate-900'}`}>{value}</p>
      {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
    </div>
  );
}
