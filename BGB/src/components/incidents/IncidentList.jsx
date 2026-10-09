import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import * as incidentsApi from '../../api/incidents';
import { errorMessage } from '../../api/client';
import { formatDateDisplay } from '../../utils/helpers';
import { OverdueBadge, SeverityBadge, StatusBadge } from '../ui/Badges';
import EmptyState from '../ui/EmptyState';
import { useI18n } from '../../i18n/I18nContext';

// Quick actions show only the forward step; return/reject need a reason, so they live on the detail page.
const QUICK_ACTIONS = ['review', 'verify', 'approve'];

// `inc.actions` and `inc.canEdit` come from the server, which applies the workflow table, role,
// scope and separation-of-duties rules for the signed-in user (specs #13, #14, #25).
function RowActions({ inc, onChanged }) {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const { t, tv } = useI18n();

  const run = async (action) => {
    setBusy(true);
    try {
      const updated = await incidentsApi.workflow(inc.id, action);
      showToast(t('incidents.actionDone', { id: inc.id, status: tv('status', updated.status) }), 'success');
      onChanged?.(updated);
    } catch (err) {
      showToast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };
  const quick = (inc.actions || []).find((a) => QUICK_ACTIONS.includes(a));

  // Text buttons: the action is named, not implied by an icon
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      <button onClick={() => navigate(`/incidents/${inc.id}`)} className="btn btn-sm btn-outline" aria-label={`${t('common.view')} ${inc.id}`}>
        {t('common.view')}
      </button>
      {inc.canEdit && (
        <button onClick={() => navigate(`/incidents/${inc.id}/edit`)} className="btn btn-sm btn-outline" aria-label={`${t('common.edit')} ${inc.id}`}>
          {t('common.edit')}
        </button>
      )}
      {quick && (
        <button onClick={() => run(quick)} disabled={busy} className="btn btn-sm btn-outline-primary" aria-label={`${tv('action', quick)} ${inc.id}`}>
          {busy && <i className="fas fa-spinner fa-spin" aria-hidden="true" />}
          {tv('action', quick)}
        </button>
      )}
    </div>
  );
}

/**
 * Responsive incident listing:
 *  - < md : stacked cards (easy to tap, no horizontal scrolling)
 *  - ≥ md : data table, extra columns revealed progressively on wider screens
 */
export default function IncidentList({ incidents, compact = false, onChanged, empty }) {
  const { t } = useI18n();
  if (incidents.length === 0) {
    // `empty` = { icon, title, hint } for a specific view (My drafts, Needs my action)
    return (
      <EmptyState icon={empty?.icon || 'fa-search'} title={empty?.title || t('incidents.empty')}>
        {empty ? empty.hint : t('incidents.emptyHint')}
      </EmptyState>
    );
  }

  return (
    <>
      {/* Mobile cards */}
      <ul className="divide-y divide-gray-100 md:hidden">
        {incidents.map((inc) => (
          <li key={inc.id} className="flex items-start gap-3 p-4">
            <Link to={`/incidents/${inc.id}`} className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-medium text-bgb-700">{inc.id}</span>
                <StatusBadge status={inc.status} />
                {inc.overdue && <OverdueBadge since={inc.statusChangedAt} />}
                {inc.archivedAt && <span className="text-xs font-semibold text-navy-600">{t('incidents.archivedTag')}</span>}
              </div>
              <p className="truncate text-sm font-medium text-gray-800">{inc.title}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                <SeverityBadge severity={inc.severity} />
                <span>{inc.category}</span>
                <span>
                  <i className="far fa-calendar mr-1" />
                  {formatDateDisplay(inc.date)}
                </span>
              </div>
            </Link>
            {!compact && <RowActions inc={inc} onChanged={onChanged} />}
          </li>
        ))}
      </ul>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="th">{t('common.reference')}</th>
              <th className="th">{t('common.title')}</th>
              {!compact && <th className="th">{t('common.category')}</th>}
              {!compact && <th className="th hidden 2xl:table-cell">{t('common.bop')}</th>}
              <th className="th">{t('common.severity')}</th>
              <th className="th">{t('common.status')}</th>
              <th className={compact ? 'th hidden 2xl:table-cell' : 'th hidden lg:table-cell'}>{t('common.date')}</th>
              {!compact && <th className="th">{t('common.actions')}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {incidents.map((inc) => (
              <tr key={inc.id} className="hover:bg-gray-50">
                <td className="td whitespace-nowrap">
                  <Link to={`/incidents/${inc.id}`} className="font-mono font-medium text-bgb-700 underline-offset-2 hover:underline">
                    {inc.id}
                  </Link>
                </td>
                <td className="td max-w-[13rem] truncate text-slate-900 xl:max-w-[16rem] 2xl:max-w-xs" title={inc.title}>{inc.title}</td>
                {!compact && <td className="td whitespace-nowrap text-slate-700">{inc.category}</td>}
                {!compact && <td className="td hidden whitespace-nowrap text-gray-600 2xl:table-cell">{inc.bop}</td>}
                <td className="td">
                  <SeverityBadge severity={inc.severity} />
                </td>
                <td className="td whitespace-nowrap">
                  <div className="flex flex-col items-start gap-1">
                    <StatusBadge status={inc.status} />
                    {inc.overdue && <OverdueBadge since={inc.statusChangedAt} />}
                    {inc.archivedAt && <span className="text-xs font-semibold text-navy-600">{t('incidents.archivedTag')}</span>}
                  </div>
                </td>
                <td className={`td hidden whitespace-nowrap text-slate-600 ${compact ? '2xl:table-cell' : 'lg:table-cell'}`}>{formatDateDisplay(inc.date)}</td>
                {!compact && (
                  <td className="td py-1.5">
                    <RowActions inc={inc} onChanged={onChanged} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
