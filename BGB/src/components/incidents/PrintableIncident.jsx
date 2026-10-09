import { useApp } from '../../context/AppContext';
import { formatDateDisplay, formatDateTime, formatFileSize } from '../../utils/helpers';
import { useI18n } from '../../i18n/I18nContext';

// Specs #21, #22 — single-incident report for printing / "Save as PDF". Hidden on screen and shown
// only by the print stylesheet (the page's screen content is print:hidden). Carries the crest and
// the CONFIDENTIAL // OPERATIONAL banner (CLAUDE.md §13.10, §13.12); each print is audited.
const BANNER = 'CONFIDENTIAL // OPERATIONAL';

function Row({ label, children }) {
  return (
    <tr className="align-top">
      <th className="w-40 border border-gray-400 bg-gray-100 px-2 py-1 text-left font-semibold">{label}</th>
      <td className="border border-gray-400 px-2 py-1 whitespace-pre-line">{children || '—'}</td>
    </tr>
  );
}

export default function PrintableIncident({ incident: inc, printedAt }) {
  const { currentUser } = useApp();
  const { t, tv } = useI18n();
  const evidence = inc.evidence || [];
  const comments = inc.comments || [];

  return (
    <article className="hidden text-[11px] leading-snug text-black print:block">
      <p className="mb-3 border-y-2 border-black py-1 text-center text-xs font-extrabold tracking-[0.3em]">{BANNER}</p>

      <header className="mb-4 flex items-center gap-4 border-b-2 border-black pb-3">
        <img src="/bgb.png" alt="BGB Crest" className="h-16 w-auto" />
        <div className="flex-1">
          <h1 className="text-base font-black uppercase">{t('rep.hq')}</h1>
          <p className="text-sm font-bold">{t('print.title')}</p>
          <p className="font-mono text-sm">{inc.id}</p>
        </div>
        <div className="text-right text-[10px]">
          <p>
            {t('print.status')}: <b>{tv('status', inc.status)}</b>
          </p>
          <p>
            {t('common.severity')}: <b>{tv('severity', inc.severity)}</b>
          </p>
        </div>
      </header>

      <table className="mb-4 w-full border-collapse">
        <tbody>
          <Row label={t('print.titleField')}>{inc.title}</Row>
          <Row label={t('common.category')}>{[inc.category, inc.subcategory].filter(Boolean).join(' › ')}</Row>
          <Row label={t('detail.dateTime')}>{`${formatDateDisplay(inc.date)} ${inc.time || ''}`}</Row>
          <Row label={t('print.unit')}>{[inc.sector, inc.battalion, inc.bop].filter(Boolean).join(' › ')}</Row>
          <Row label={t('detail.location')}>{[inc.location, inc.lat != null && inc.lng != null ? `GPS ${inc.lat}, ${inc.lng}` : null].filter(Boolean).join(' — ')}</Row>
          <Row label={t('detail.createdBy')}>{`${inc.createdByName || inc.createdBy} — ${formatDateTime(inc.createdAt)}`}</Row>
        </tbody>
      </table>

      <h2 className="mb-1 text-xs font-bold uppercase">{t('detail.description')}</h2>
      <p className="mb-3 whitespace-pre-line border border-gray-400 p-2">{inc.description || '—'}</p>

      <table className="mb-4 w-full border-collapse">
        <tbody>
          <Row label={t('detail.persons')}>{inc.personsInvolved}</Row>
          <Row label={t('detail.actionTaken')}>{inc.actionTaken}</Row>
          <Row label={t('detail.outcome')}>{inc.outcome}</Row>
        </tbody>
      </table>

      <h2 className="mb-1 text-xs font-bold uppercase">{t('detail.evidence', { n: evidence.length })}</h2>
      {evidence.length ? (
        <table className="mb-4 w-full border-collapse text-[10px]">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-400 px-2 py-1 text-left">{t('print.file')}</th>
              <th className="border border-gray-400 px-2 py-1 text-left">{t('print.size')}</th>
              <th className="border border-gray-400 px-2 py-1 text-left">{t('print.uploaded')}</th>
              <th className="border border-gray-400 px-2 py-1 text-left">SHA-256</th>
            </tr>
          </thead>
          <tbody>
            {evidence.map((ev) => (
              <tr key={ev.id}>
                <td className="border border-gray-400 px-2 py-1">{ev.name}</td>
                <td className="border border-gray-400 px-2 py-1 whitespace-nowrap">{formatFileSize(ev.size)}</td>
                <td className="border border-gray-400 px-2 py-1 whitespace-nowrap">{formatDateTime(ev.uploadedAt)}</td>
                <td className="border border-gray-400 px-2 py-1 font-mono break-all">{ev.sha256 || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mb-4">{t('detail.noEvidence')}</p>
      )}

      <h2 className="mb-1 text-xs font-bold uppercase">{t('detail.timeline')}</h2>
      <table className="mb-4 w-full border-collapse text-[10px]">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-gray-400 px-2 py-1 text-left">{t('print.when')}</th>
            <th className="border border-gray-400 px-2 py-1 text-left">{t('print.action')}</th>
            <th className="border border-gray-400 px-2 py-1 text-left">{t('print.by')}</th>
            <th className="border border-gray-400 px-2 py-1 text-left">{t('print.notes')}</th>
          </tr>
        </thead>
        <tbody>
          {(inc.timeline || []).map((e, i) => (
            <tr key={i} className="align-top">
              <td className="border border-gray-400 px-2 py-1 whitespace-nowrap">{formatDateTime(e.date)}</td>
              <td className="border border-gray-400 px-2 py-1">{tv('timeline', e.action)}</td>
              <td className="border border-gray-400 px-2 py-1">{e.user}</td>
              <td className="border border-gray-400 px-2 py-1 whitespace-pre-line">{e.notes || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {comments.length > 0 && (
        <>
          <h2 className="mb-1 text-xs font-bold uppercase">{t('detail.comments', { n: comments.length })}</h2>
          <table className="mb-4 w-full border-collapse text-[10px]">
            <tbody>
              {comments.map((c) => (
                <tr key={c.id} className="align-top">
                  <td className="w-40 border border-gray-400 px-2 py-1">
                    <b>{c.user}</b>
                    <br />
                    {formatDateTime(c.date)}
                  </td>
                  <td className="border border-gray-400 px-2 py-1 whitespace-pre-line">{c.body}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div className="mt-10 grid grid-cols-2 gap-10 text-center font-bold">
        <div>
          <div className="mb-1 border-b border-black pb-6" />
          {t('print.signFiler')}
        </div>
        <div>
          <div className="mb-1 border-b border-black pb-6" />
          {t('print.signApprover')}
        </div>
      </div>

      <footer className="mt-6 border-t border-black pt-2 text-[9px]">
        <p>{t('print.printedBy', { name: currentUser?.name || '', date: formatDateTime(printedAt, { withSeconds: true }) })}</p>
        <p className="mt-2 border-y-2 border-black py-1 text-center text-xs font-extrabold tracking-[0.3em]">{BANNER}</p>
      </footer>
    </article>
  );
}
