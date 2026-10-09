import Card from '../../components/ui/Card';

// Specs #13, #14 — reference view of the workflow the server enforces
// (server/src/modules/incidents/workflow.ts). The stages are fixed; see DOUBT-008 for the
// scoping and separation-of-duties rules.
const STAGES = [
  { name: 'Draft', icon: 'fa-file-alt', color: 'bg-blue-600', desc: 'Created by the filing officer; visible only to them' },
  { name: 'Submitted', icon: 'fa-paper-plane', color: 'bg-amber-500', desc: 'Filed for supervisory review' },
  { name: 'Reviewed', icon: 'fa-search', color: 'bg-indigo-600', desc: 'Facts cross-checked by a reviewer' },
  { name: 'Verified', icon: 'fa-check-circle', color: 'bg-emerald-600', desc: 'Evidence and intelligence confirmed' },
  { name: 'Approved', icon: 'fa-thumbs-up', color: 'bg-bgb-600', desc: 'Officially approved for command reporting' },
  { name: 'Closed', icon: 'fa-lock', color: 'bg-gray-700', desc: 'Case completed; the record is locked' },
];

const REVIEWERS = ['Sector Officer', 'Verifier/Approver', 'HQ Administrator'];
const APPROVERS = ['Verifier/Approver', 'HQ Administrator'];

const RULES = [
  { from: 'Draft / Returned', to: 'Submitted', icon: 'fa-file-import', border: 'border-l-blue-500', badge: 'bg-blue-50 text-blue-700 border-blue-200', roles: ['Filing officer only'], desc: 'Only the officer who created the report can edit and submit it, and only while it is a Draft or Returned.' },
  { from: 'Submitted', to: 'Reviewed', icon: 'fa-clipboard-check', border: 'border-l-amber-500', badge: 'bg-amber-50 text-amber-700 border-amber-200', roles: REVIEWERS, desc: 'Preliminary cross-check of the reported facts by Sector HQ or higher.' },
  { from: 'Reviewed', to: 'Verified', icon: 'fa-user-check', border: 'border-l-indigo-500', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200', roles: APPROVERS, desc: 'Formal confirmation of evidence and intelligence.' },
  { from: 'Verified', to: 'Approved', icon: 'fa-award', border: 'border-l-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', roles: APPROVERS, desc: 'Final approval for inclusion in national command reporting.' },
  { from: 'Approved', to: 'Closed', icon: 'fa-lock', border: 'border-l-navy-700', badge: 'bg-navy-50 text-navy-800 border-navy-200', roles: ['HQ Administrator'], desc: 'Permanent closure. Closed records cannot be modified.' },
  { from: 'Submitted / Reviewed / Verified', to: 'Returned', icon: 'fa-undo-alt', border: 'border-l-pink-500', badge: 'bg-pink-50 text-pink-700 border-pink-200', roles: REVIEWERS, desc: 'Sent back to the filing officer for correction. A reason is mandatory and is shown in the timeline.' },
  { from: 'Submitted / Reviewed / Verified', to: 'Rejected', icon: 'fa-times-circle', border: 'border-l-red-500', badge: 'bg-red-50 text-red-700 border-red-200', roles: REVIEWERS, desc: 'Rejected as invalid or unfounded. A reason is mandatory; the record is kept.' },
];

export default function AdminWorkflow() {
  return (
    <Card title="Workflow Pipeline & Authorization Matrix" icon="fa-sitemap" bodyClassName="space-y-6">
      <div>
        <h4 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500">
          <i className="fas fa-stream text-bgb-600" /> Incident Progression Lifecycle
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
                <h5 className="text-sm font-bold text-gray-900">{stage.name}</h5>
                <p className="mt-1 text-xs leading-snug text-gray-500">{stage.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500">
          <i className="fas fa-shield-alt text-bgb-600" /> State Transition Authorization Rules
        </h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {RULES.map((rule) => (
            <div key={rule.from + rule.to} className={`flex flex-col justify-between space-y-3 rounded-xl border border-l-4 border-gray-200 bg-white p-4 transition-all hover:border-bgb-400 hover:shadow-md ${rule.border}`}>
              <div>
                <span className={`mb-2 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-bold ${rule.badge}`}>
                  <i className={`fas ${rule.icon} text-[10px]`} />
                  {rule.from} &rarr; {rule.to}
                </span>
                <p className="text-xs leading-relaxed text-gray-600">{rule.desc}</p>
              </div>
              <div className="border-t border-gray-100 pt-2">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-400">Authorized Roles</span>
                <div className="flex flex-wrap gap-1">
                  {rule.roles.map((r) => (
                    <span key={r} className="rounded border border-gray-200 bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700">
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
        {[
          ['fa-user-slash', 'Separation of duties', 'Nobody can review, verify, approve, close, return or reject an incident they filed themselves.'],
          ['fa-sitemap', 'Area of responsibility', 'Users act only on incidents at or below their own unit (HQ, sector, battalion or BOP).'],
          ['fa-random', 'Concurrent actions', 'If two officers act on the same record at once, exactly one succeeds; the other is told the record changed.'],
        ].map(([icon, title, text]) => (
          <div key={title} className="rounded-xl border border-bgb-100 bg-bgb-50/60 p-3">
            <p className="mb-1 font-bold text-bgb-900">
              <i className={`fas ${icon} mr-1.5 text-bgb-600`} />
              {title}
            </p>
            <p className="text-gray-600">{text}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
