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
const QUICK_ACTIONS = {
  review: { icon: 'fa-search', cls: 'text-green-600 hover:bg-green-50' },
  verify: { icon: 'fa-check', cls: 'text-green-600 hover:bg-green-50' },
  approve: { icon: 'fa-thumbs-up', cls: 'text-green-700 hover:bg-green-50' },
};

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
  const quick = (inc.actions || []).find((a) => QUICK_ACTIONS[a]);

  const btn = 'inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors disabled:opacity-50';

  return (
    <div className="flex items-center gap-1">
      <button onClick={() => navigate(`/incidents/${inc.id}`)} className={`${btn} text-bgb-600 hover:bg-bgb-50`} title={t('common.view')} aria-label={`${t('common.view')} ${inc.id}`}>
        <i className="fas fa-eye text-sm" />
      </button>
      {inc.canEdit && (
        <button onClick={() => navigate(`/incidents/${inc.id}/edit`)} className={`${btn} text-blue-600 hover:bg-blue-50`} title={t('common.edit')} aria-label={`${t('common.edit')} ${inc.id}`}>
          <i className="fas fa-edit text-sm" />
        </button>
      )}
      {quick && (
        <button
          onClick={() => run(quick)}
          disabled={busy}
          className={`${btn} ${QUICK_ACTIONS[quick].cls}`}
          title={tv('action', quick)}
          aria-label={`${tv('action', quick)} ${inc.id}`}
        >
          <i className={`fas ${busy ? 'fa-spinner fa-spin' : QUICK_ACTIONS[quick].icon} text-sm`} />
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
                {inc.archivedAt && <i className="fas fa-box-archive text-xs text-navy-500" title={t('incidents.archivedTag')} />}
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
              <th className="th">{t('common.category')}</th>
              {!compact && <th className="th hidden xl:table-cell">{t('common.bop')}</th>}
              <th className="th">{t('common.severity')}</th>
              <th className="th">{t('common.status')}</th>
              <th className="th hidden lg:table-cell">{t('common.date')}</th>
              <th className="th">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {incidents.map((inc) => (
              <tr key={inc.id} className="hover:bg-gray-50">
                <td className="td whitespace-nowrap font-mono font-medium text-bgb-700">{inc.id}</td>
                <td className="td max-w-[14rem] truncate text-gray-800 lg:max-w-xs">{inc.title}</td>
                <td className="td whitespace-nowrap text-gray-600">{inc.category}</td>
                {!compact && <td className="td hidden whitespace-nowrap text-gray-600 xl:table-cell">{inc.bop}</td>}
                <td className="td">
                  <SeverityBadge severity={inc.severity} />
                </td>
                <td className="td whitespace-nowrap">
                  <StatusBadge status={inc.status} />
                  {inc.overdue && (
                    <span className="ml-1.5">
                      <OverdueBadge since={inc.statusChangedAt} />
                    </span>
                  )}
                  {inc.archivedAt && <i className="fas fa-box-archive ml-1.5 text-xs text-navy-500" title={t('incidents.archivedTag')} aria-label={t('incidents.archivedTag')} />}
                </td>
                <td className="td hidden whitespace-nowrap text-gray-500 lg:table-cell">{formatDateDisplay(inc.date)}</td>
                <td className="td py-1.5">
                  <RowActions inc={inc} onChanged={onChanged} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
