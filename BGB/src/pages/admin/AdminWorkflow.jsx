import Card from '../../components/ui/Card';
import { useI18n } from '../../i18n/I18nContext';

// Specs #13, #14 — reference view of the workflow the server enforces
// (server/src/modules/incidents/workflow.ts). The stages are fixed; see DOUBT-008 for the
// scoping and separation-of-duties rules.
const STAGES = ['Draft', 'Submitted', 'Reviewed', 'Verified', 'Approved', 'Closed'];

const REVIEWERS = ['Sector Officer', 'Verifier/Approver', 'HQ Administrator'];
const APPROVERS = ['Verifier/Approver', 'HQ Administrator'];

// from: a status, or a wf.from.* key; roles: role names, or null for "filing officer only"
const RULES = [
  { id: 'submit', from: 'wf.from.draftReturned', to: 'Submitted', roles: null },
  { id: 'review', from: 'Submitted', to: 'Reviewed', roles: REVIEWERS },
  { id: 'verify', from: 'Reviewed', to: 'Verified', roles: APPROVERS },
  { id: 'approve', from: 'Verified', to: 'Approved', roles: APPROVERS },
  { id: 'close', from: 'Approved', to: 'Closed', roles: ['HQ Administrator'] },
  { id: 'return', from: 'wf.from.anyReview', to: 'Returned', roles: REVIEWERS },
  { id: 'reject', from: 'wf.from.anyReview', to: 'Rejected', roles: REVIEWERS },
];

const NOTES = [
  ['wf.sod', 'wf.sodText'],
  ['wf.aor', 'wf.aorText'],
  ['wf.concurrent', 'wf.concurrentText'],
  ['wf.modify', 'wf.modifyText'], // spec #14
];

export default function AdminWorkflow() {
  const { t, tv } = useI18n();
  const fromLabel = (from) => (from.startsWith('wf.') ? t(from) : tv('status', from));
  return (
    <Card title={t('wf.title')} bodyClassName="space-y-6">
      <section>
        <h4 className="mb-3 text-sm font-semibold text-slate-900">{t('wf.lifecycle')}</h4>
        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {STAGES.map((name, i) => (
            <li key={name} className="rounded-md border border-slate-200 p-3">
              <p className="text-xs font-medium text-slate-600">{t('wf.stageN', { n: i + 1 })}</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-900">{tv('status', name)}</p>
              <p className="mt-1 text-xs leading-snug text-slate-600">{t(`wf.stage.${name}`)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h4 className="mb-3 text-sm font-semibold text-slate-900">{t('wf.rules')}</h4>
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="w-full text-left">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">{t('wf.thTransition')}</th>
                <th className="th">{t('wf.authorized')}</th>
                <th className="th">{t('wf.thRule')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {RULES.map((rule) => (
                <tr key={rule.id} className="align-top">
                  <td className="td whitespace-nowrap font-medium text-slate-900">
                    {fromLabel(rule.from)} → {tv('status', rule.to)}
                  </td>
                  <td className="td text-slate-700">{rule.roles ? rule.roles.map((r) => tv('role', r)).join(', ') : t('wf.filerOnly')}</td>
                  <td className="td text-slate-700">{t(`wf.rule.${rule.id}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {NOTES.map(([title, text]) => (
          <div key={title} className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
            <p className="font-semibold text-slate-900">{t(title)}</p>
            <p className="mt-1 text-slate-700">{t(text)}</p>
          </div>
        ))}
      </section>
    </Card>
  );
}
