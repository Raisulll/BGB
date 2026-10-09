import Card from '../../components/ui/Card';
import { useI18n } from '../../i18n/I18nContext';

// Specs #13, #14 — reference view of the workflow the server enforces
// (server/src/modules/incidents/workflow.ts). The stages are fixed; see DOUBT-008 for the
// scoping and separation-of-duties rules.
const STAGES = [
  { name: 'Draft', icon: 'fa-file-alt', color: 'bg-blue-600' },
  { name: 'Submitted', icon: 'fa-paper-plane', color: 'bg-amber-500' },
  { name: 'Reviewed', icon: 'fa-search', color: 'bg-indigo-600' },
  { name: 'Verified', icon: 'fa-check-circle', color: 'bg-emerald-600' },
  { name: 'Approved', icon: 'fa-thumbs-up', color: 'bg-bgb-600' },
  { name: 'Closed', icon: 'fa-lock', color: 'bg-gray-700' },
];

const REVIEWERS = ['Sector Officer', 'Verifier/Approver', 'HQ Administrator'];
const APPROVERS = ['Verifier/Approver', 'HQ Administrator'];

// from: a status, or a wf.from.* key; roles: role names, or null for "filing officer only"
const RULES = [
  { id: 'submit', from: 'wf.from.draftReturned', to: 'Submitted', icon: 'fa-file-import', border: 'border-l-blue-500', badge: 'bg-blue-50 text-blue-700 border-blue-200', roles: null },
  { id: 'review', from: 'Submitted', to: 'Reviewed', icon: 'fa-clipboard-check', border: 'border-l-amber-500', badge: 'bg-amber-50 text-amber-700 border-amber-200', roles: REVIEWERS },
  { id: 'verify', from: 'Reviewed', to: 'Verified', icon: 'fa-user-check', border: 'border-l-indigo-500', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200', roles: APPROVERS },
  { id: 'approve', from: 'Verified', to: 'Approved', icon: 'fa-award', border: 'border-l-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', roles: APPROVERS },
  { id: 'close', from: 'Approved', to: 'Closed', icon: 'fa-lock', border: 'border-l-navy-700', badge: 'bg-navy-50 text-navy-800 border-navy-200', roles: ['HQ Administrator'] },
  { id: 'return', from: 'wf.from.anyReview', to: 'Returned', icon: 'fa-undo-alt', border: 'border-l-pink-500', badge: 'bg-pink-50 text-pink-700 border-pink-200', roles: REVIEWERS },
  { id: 'reject', from: 'wf.from.anyReview', to: 'Rejected', icon: 'fa-times-circle', border: 'border-l-red-500', badge: 'bg-red-50 text-red-700 border-red-200', roles: REVIEWERS },
];

const NOTES = [
  ['fa-user-slash', 'wf.sod', 'wf.sodText'],
  ['fa-sitemap', 'wf.aor', 'wf.aorText'],
  ['fa-random', 'wf.concurrent', 'wf.concurrentText'],
];

export default function AdminWorkflow() {
  const { t, tv } = useI18n();
  const fromLabel = (from) => (from.startsWith('wf.') ? t(from) : tv('status', from));
  return (
    <Card title={t('wf.title')} icon="fa-sitemap" bodyClassName="space-y-6">
      <div>
        <h4 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500">
          <i className="fas fa-stream text-bgb-600" /> {t('wf.lifecycle')}
        </h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {STAGES.map((stage, i) => (
            <div key={stage.name} className="group flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-4 transition-all hover:-translate-y-1 hover:border-bgb-500 hover:shadow-md">
              <div>
                <div className="mb-3 flex items-center justify-between border-b border-gray-100 pb-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-bgb-600 font-mono text-xs font-bold text-white">0{i + 1}</span>
                  <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${stage.color} text-white transition-transform group-hover:scale-110`}>
                    <i className={`fas ${stage.icon} text-xs`} />
                  </div>
                </div>
                <h5 className="text-sm font-bold text-gray-900">{tv('status', stage.name)}</h5>
                <p className="mt-1 text-xs leading-snug text-gray-500">{t(`wf.stage.${stage.name}`)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500">
          <i className="fas fa-shield-alt text-bgb-600" /> {t('wf.rules')}
        </h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {RULES.map((rule) => (
            <div key={rule.id} className={`flex flex-col justify-between space-y-3 rounded-xl border border-l-4 border-gray-200 bg-white p-4 transition-all hover:border-bgb-400 hover:shadow-md ${rule.border}`}>
              <div>
                <span className={`mb-2 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-bold ${rule.badge}`}>
                  <i className={`fas ${rule.icon} text-[10px]`} />
                  {fromLabel(rule.from)} &rarr; {tv('status', rule.to)}
                </span>
                <p className="text-xs leading-relaxed text-gray-600">{t(`wf.rule.${rule.id}`)}</p>
              </div>
              <div className="border-t border-gray-100 pt-2">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-400">{t('wf.authorized')}</span>
                <div className="flex flex-wrap gap-1">
                  {(rule.roles || [t('wf.filerOnly')]).map((r) => (
                    <span key={r} className="rounded border border-gray-200 bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700">
                      {rule.roles ? tv('role', r) : r}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
        {NOTES.map(([icon, title, text]) => (
          <div key={title} className="rounded-xl border border-bgb-100 bg-bgb-50/60 p-3">
            <p className="mb-1 font-bold text-bgb-900">
              <i className={`fas ${icon} mr-1.5 text-bgb-600`} />
              {t(title)}
            </p>
            <p className="text-gray-600">{t(text)}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
