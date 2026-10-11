import { useApp } from '../../context/AppContext';
import { formatDateDisplay, formatDateTime } from '../../utils/helpers';
import { useI18n } from '../../i18n/I18nContext';
import OfficialDocument, { Distribution, Section, SignatureBlock, Signatures } from '../reports/OfficialDocument';
import { IncidentRecord } from '../reports/IncidentAnnex';

// Specs #7, #10–#12, #21, #22 — single-incident report as a formal BGB document (shown in the print
// preview and printed / saved as PDF as is): letterhead, classification on every page, document
// reference issued by the server on print (audited PRINT_INCIDENT), the full record with evidence
// (photographs reproduced, a still frame for each video), certificate, signature blocks
// prefilled from the record's history, and distribution (CLAUDE.md §13.10, §13.12).
const lastBy = (timeline, action) => [...(timeline || [])].reverse().find((e) => e.action === action);

export default function PrintableIncident({ incident: inc, printed, previews }) {
  const { currentUser } = useApp();
  const { t } = useI18n();
  const reviewed = lastBy(inc.timeline, 'Reviewed');
  const approved = lastBy(inc.timeline, 'Approved');
  const asAt = formatDateTime(printed?.printedAt || new Date().toISOString());
  const certificateNo = (inc.comments || []).length ? 6 : 5; // follows the record's numbered paragraphs

  return (
    <OfficialDocument
      reference={printed?.reference}
      docDate={formatDateDisplay(printed?.printedAt || new Date().toISOString())}
      subject={t('print.subject', { id: inc.id, title: inc.title })}
    >
      <IncidentRecord inc={inc} previews={previews || {}} figLabel={(i) => t('print.fig', { i })} />

      <Section n={certificateNo} title={t('rep.doc.s.certificate')}>
        <p className="text-justify">{t('print.certify', { id: inc.id, time: asAt })}</p>
      </Section>

      <Signatures>
        <SignatureBlock
          title={t('print.signFiler')}
          name={inc.createdByName}
          unit={[inc.battalion, inc.bop].filter(Boolean).join(', ')}
          date={formatDateDisplay(inc.createdAt)}
        />
        <SignatureBlock title={t('print.signReviewer')} name={reviewed?.user} date={reviewed ? formatDateDisplay(reviewed.date) : ''} />
        <SignatureBlock title={t('rep.doc.approvedBy')} name={approved?.user} date={approved ? formatDateDisplay(approved.date) : ''} />
      </Signatures>

      <Distribution />

      {printed && (
        <p className="mt-6 text-[0.8em]">{t('print.printedBy', { name: currentUser?.name || '', date: formatDateTime(printed.printedAt, { withSeconds: true }) })}</p>
      )}
    </OfficialDocument>
  );
}
