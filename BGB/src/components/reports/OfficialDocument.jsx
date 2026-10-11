import { useI18n } from '../../i18n/I18nContext';

// Specs #21, #22 — the formal BGB document frame shared by printed reports and single-incident
// printouts: A4 sheet on screen, printed as is. Letterhead with the crest, classification at the
// top and bottom of every page (the outer table's thead/tfoot repeat on each printed page),
// reference number and date line, subject (CLAUDE.md §13.10, §13.12; layout per DOUBT-016 until
// BGB supplies its own sample). "Page x of y" comes from the @page rule in PrintPreview.
export const BANNER = 'CONFIDENTIAL // OPERATIONAL';
export const TH = 'border border-gray-500 bg-gray-100 px-2 py-1 text-left font-semibold align-bottom';
export const TD = 'border border-gray-500 px-2 py-1 align-top';
export const NUM = 'text-right tabular-nums';

/** Numbered paragraph with an underlined heading */
export function Section({ n, title, children }) {
  return (
    <section className="mt-5 break-inside-avoid-page">
      <h3 className="mb-2 font-bold break-after-avoid">
        {n}.&nbsp;&nbsp;<span className="underline underline-offset-2">{title}</span>
      </h3>
      <div className="pl-6">{children}</div>
    </section>
  );
}

export function SignatureBlock({ title, name, appointment, unit, date }) {
  const { t } = useI18n();
  const line = (label, value) => (
    <p className="flex gap-1">
      <span className="shrink-0">{label}:</span>
      <span className="min-w-0 flex-1 border-b border-dotted border-gray-500">{value || ' '}</span>
    </p>
  );
  return (
    <div className="break-inside-avoid">
      <p className="font-bold">{title}</p>
      <div className="mt-10 mb-1 border-b border-black" aria-hidden="true" />
      <p className="mb-2 text-center text-[0.85em]">({t('rep.doc.signature')})</p>
      <div className="space-y-1.5">
        {line(t('rep.doc.name'), name)}
        {line(t('rep.doc.appointment'), appointment)}
        {line(t('rep.doc.unit'), unit)}
        {line(t('rep.doc.date'), date)}
      </div>
    </div>
  );
}

/** Three signature blocks side by side (stacked on phones) */
export function Signatures({ children }) {
  return <div className="mt-8 grid grid-cols-1 gap-8 break-inside-avoid sm:grid-cols-3 print:grid-cols-3">{children}</div>;
}

export function Distribution() {
  const { t } = useI18n();
  return (
    <div className="mt-8 break-inside-avoid">
      <p className="font-bold underline underline-offset-2">{t('rep.doc.distribution')}:</p>
      <p className="mt-1">{t('rep.doc.distInfo')}</p>
      <ol className="mt-1 list-decimal space-y-2 pl-10">
        <li className="border-b border-dotted border-gray-500">&nbsp;</li>
        <li className="border-b border-dotted border-gray-500">&nbsp;</li>
        <li>{t('rep.doc.distOffice')}</li>
      </ol>
    </div>
  );
}

/** reference: issued by the server on print (null before); subject: the subject line text */
export default function OfficialDocument({ reference, docDate, subject, children }) {
  const { t } = useI18n();
  const ref = reference || t('rep.doc.refPending');
  return (
    <article className="official-doc mx-auto w-full max-w-[210mm] bg-white px-4 py-6 text-[13px] leading-normal text-black shadow-sm ring-1 ring-slate-200 sm:px-10 sm:py-10 print:max-w-none print:p-0 print:text-[10.5pt] print:shadow-none print:ring-0">
      {/* table-fixed: the page never grows past the sheet; wide tables scroll inside their own box */}
      <table className="w-full table-fixed border-collapse">
        {/* Repeated at the top of every printed page */}
        <thead>
          <tr>
            <td className="pb-3 text-center text-[0.95em] font-bold tracking-[0.25em]">{BANNER}</td>
          </tr>
        </thead>
        {/* Repeated at the foot of every printed page */}
        <tfoot>
          <tr>
            <td className="pt-3">
              <div className="flex flex-wrap justify-between gap-x-4 border-t border-black pt-1 text-[0.8em]">
                <span>{t('rep.doc.footer')}</span>
                <span>
                  {t('rep.doc.refNo')}: {ref}
                </span>
              </div>
              <p className="mt-1 text-center text-[0.95em] font-bold tracking-[0.25em]">{BANNER}</p>
            </td>
          </tr>
        </tfoot>
        <tbody>
          <tr>
            <td>
              <header className="text-center">
                <img src="/bgb.png" alt={t('rep.doc.crest')} className="mx-auto h-20 w-auto print:h-[22mm]" />
                <p className="mt-2 text-[0.92em]">{t('rep.doc.govt')}</p>
                <p className="text-[1.45em] font-bold tracking-wide">{t('rep.doc.org')}</p>
                <p className="font-semibold">{t('rep.doc.hqAddress')}</p>
                <p className="text-[0.9em]">{t('rep.doc.system')}</p>
              </header>
              <div className="mt-3 border-t-[3px] border-double border-black" aria-hidden="true" />

              <div className="mt-3 flex flex-wrap justify-between gap-x-6 gap-y-1">
                <p>
                  {t('rep.doc.refNo')}: <span className="font-semibold">{ref}</span>
                </p>
                <p>
                  {t('rep.doc.date')}: <span className="font-semibold">{docDate}</span>
                </p>
              </div>

              <p className="mt-4">
                <span className="font-bold">{t('rep.doc.subject')}:</span> <span className="font-bold underline underline-offset-2">{subject}</span>
              </p>

              {children}
            </td>
          </tr>
        </tbody>
      </table>
    </article>
  );
}
