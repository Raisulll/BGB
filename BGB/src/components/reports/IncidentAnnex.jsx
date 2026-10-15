import { FILE_ICONS, fileKind, formatDateDisplay, formatDateTime, formatFileSize } from '../../utils/helpers';
import { formatDuration } from '../../utils/evidencePreview';
import { useI18n } from '../../i18n/I18nContext';
import { TD } from './OfficialDocument';

// Specs #7, #10, #11, #12, #21, #22 — Annex A of the printed report: one formal record per incident,
// each starting on a new page, with its particulars, narrative, evidence (photographs reproduced,
// a still frame for each video, documents listed), timeline and comments.
const TH = 'border border-gray-500 bg-gray-100 px-2 py-1 text-left font-semibold align-top';

const EXT = {
  'image/jpeg': 'JPEG', 'image/png': 'PNG', 'image/gif': 'GIF', 'video/mp4': 'MP4', 'video/quicktime': 'MOV', 'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word (DOCX)', 'application/msword': 'Word (DOC)',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel (XLSX)', 'application/vnd.ms-excel': 'Excel (XLS)',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint (PPTX)', 'application/vnd.ms-powerpoint': 'PowerPoint (PPT)',
  'application/vnd.oasis.opendocument.text': 'OpenDocument text', 'application/vnd.oasis.opendocument.spreadsheet': 'OpenDocument spreadsheet',
  'application/vnd.oasis.opendocument.presentation': 'OpenDocument presentation', 'application/rtf': 'RTF',
};
const kindOf = (mime) => (mime?.startsWith('image/') ? 'image' : mime?.startsWith('video/') ? 'video' : 'document');
// Caption wording: camera JPEGs are photographs; PNG/GIF are usually scans or screenshots
const labelOf = (mime) => (mime === 'image/jpeg' ? 'photo' : kindOf(mime));

function Placeholder({ icon, children }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center text-[0.9em] text-gray-600">
      <i className={`fas ${icon} text-2xl text-gray-400`} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

function Figure({ label, ev, preview }) {
  const { t } = useI18n();
  const kind = kindOf(ev.mimeType);
  const m = ev.metadata || {};
  const ext = EXT[ev.mimeType] || ev.mimeType;
  const camera = [m.exif?.Make, m.exif?.Model].filter(Boolean).join(' ');
  const w = preview?.width ?? m.exif?.ExifImageWidth ?? m.exif?.ImageWidth;
  const h = preview?.height ?? m.exif?.ExifImageHeight ?? m.exif?.ImageHeight;

  let media;
  if (!ev.available) media = <Placeholder icon="fa-file-circle-xmark">{t('rep.annex.notStored')}</Placeholder>;
  else if (kind === 'document') media = <Placeholder icon={(FILE_ICONS[fileKind(ev.mimeType)] || FILE_ICONS.file).icon}>{t('rep.annex.documentNote')}</Placeholder>;
  else if (!preview || preview.status === 'loading') media = <Placeholder icon={kind === 'video' ? 'fa-film' : 'fa-image'}>{t('rep.annex.loadingPreview')}</Placeholder>;
  else if (preview.status === 'error')
    media = <Placeholder icon={kind === 'video' ? 'fa-film' : 'fa-image'}>{preview.code === 'NO_FRAME' ? t('rep.annex.noFrame') : t('rep.annex.previewFailed', { reason: preview.message })}</Placeholder>;
  else
    media = (
      <div className="relative h-full w-full">
        <img src={preview.url} alt={ev.name} className="h-full w-full object-contain" />
        {kind === 'video' && (
          <>
            <span className="absolute top-1/2 left-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-black/60 text-white" aria-hidden="true">
              <i className="fas fa-play ml-0.5" />
            </span>
            <span className="absolute bottom-1 left-1 bg-black/70 px-1.5 py-0.5 text-[0.8em] text-white">
              {t('rep.annex.frameAt', { at: formatDuration(preview.frameAt) })}
              {preview.duration != null && ` / ${formatDuration(preview.duration)}`}
            </span>
          </>
        )}
      </div>
    );

  const facts = [
    `${t(`rep.annex.kind.${labelOf(ev.mimeType)}`)} (${ext})`,
    formatFileSize(ev.size),
    kind === 'video' && preview?.duration != null ? t('rep.annex.duration', { d: formatDuration(preview.duration) }) : null,
    kind !== 'document' && w && h ? `${w} × ${h} px` : null,
  ].filter(Boolean);

  return (
    <figure className="break-inside-avoid border border-gray-500">
      {/* Full-size area for pictures; a short box when there is nothing to show */}
      <div className={`bg-gray-50 ${!ev.available || kind === 'document' ? 'h-24 print:h-[22mm]' : 'h-56 print:h-[58mm]'}`}>{media}</div>
      <figcaption className="space-y-0.5 border-t border-gray-500 px-2 py-1.5 text-[0.88em] leading-snug">
        <p className="font-bold break-all">
          {label}&nbsp;&nbsp;{ev.name}
        </p>
        <p>{facts.join(' · ')}</p>
        {(m.exif?.DateTimeOriginal || camera) && (
          <p>{[m.exif?.DateTimeOriginal && t('detail.captured', { date: formatDateTime(m.exif.DateTimeOriginal) }), camera].filter(Boolean).join(' · ')}</p>
        )}
        {m.document && (m.document.author || m.document.created) && (
          <p>
            {[
              m.document.author && t('detail.docAuthor', { name: m.document.author }),
              m.document.created && t('detail.docCreated', { date: formatDateTime(m.document.created) }),
              m.document.modified && t('detail.docModified', { date: formatDateTime(m.document.modified) }),
            ].filter(Boolean).join(' · ')}
          </p>
        )}
        {m.gps && <p>{t('rep.annex.gps', { lat: m.gps.latitude.toFixed(5), lng: m.gps.longitude.toFixed(5) })}</p>}
        <p>{t('rep.annex.uploaded', { date: formatDateTime(ev.uploadedAt), id: ev.id })}</p>
        {kind === 'video' && ev.available && <p className="italic">{t('rep.annex.videoNote')}</p>}
        {ev.sha256 && <p className="font-mono text-[0.85em] break-all">SHA-256 {ev.sha256}</p>}
      </figcaption>
    </figure>
  );
}

function Para({ letter, title, children }) {
  return (
    <div className="mt-2 break-inside-avoid">
      <p className="font-semibold">
        {letter}.&nbsp;&nbsp;{title}
      </p>
      <p className="pl-5 text-justify whitespace-pre-line">{children || '—'}</p>
    </div>
  );
}

function Heading({ children }) {
  return <h4 className="mt-4 mb-1.5 font-bold underline underline-offset-2 break-after-avoid">{children}</h4>;
}

/**
 * One incident in full: particulars, narrative, evidence figures, record history and comments.
 * Used by Annex A (figLabel → "Fig. A-3.1") and the single-incident printout ("Fig. 1").
 */
export function IncidentRecord({ inc, previews, figLabel }) {
  const { t, tv } = useI18n();
  const evidence = inc.evidence || [];
  const comments = inc.comments || [];
  return (
    <>
      <Heading>1.&nbsp;&nbsp;{t('rep.annex.particulars')}</Heading>
      <table className="w-full border-collapse">
        <tbody>
          {[
            [t('common.reference'), inc.id],
            [t('common.title'), inc.title],
            [t('common.category'), [inc.category, inc.subcategory].filter(Boolean).join(' / ')],
            [t('common.severity'), tv('severity', inc.severity)],
            [t('common.status'), [tv('status', inc.status), inc.overdue ? t('rep.annex.overdue') : null, inc.archivedAt ? t('rep.annex.archived') : null].filter(Boolean).join(' · ')],
            [t('detail.dateTime'), `${formatDateDisplay(inc.date)} ${inc.time || ''}`.trim()],
            [t('print.unit'), [inc.sector, inc.battalion, inc.bop].filter(Boolean).join(' / ')],
            [t('detail.location'), inc.location],
            [t('rep.annex.coordinates'), inc.lat != null && inc.lng != null ? `${inc.lat}, ${inc.lng}` : null],
            [t('rep.annex.filedBy'), `${inc.createdByName || inc.createdBy}, ${formatDateTime(inc.createdAt)}`],
            [t('rep.annex.lastChange'), inc.statusChangedAt ? formatDateTime(inc.statusChangedAt) : null],
          ].map(([label, value]) => (
            <tr key={label} className="break-inside-avoid">
              <th className={`${TH} w-44`}>{label}</th>
              <td className={TD}>{value || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Heading>2.&nbsp;&nbsp;{t('rep.annex.narrative')}</Heading>
      <Para letter="a" title={t('detail.description')}>{inc.description}</Para>
      <Para letter="b" title={t('detail.persons')}>{inc.personsInvolved}</Para>
      <Para letter="c" title={t('detail.actionTaken')}>{inc.actionTaken}</Para>
      <Para letter="d" title={t('detail.outcome')}>{inc.outcome}</Para>

      <Heading>3.&nbsp;&nbsp;{t('rep.annex.evidence', { n: evidence.length })}</Heading>
      {evidence.length ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 print:grid-cols-2">
          {evidence.map((ev, i) => (
            <Figure key={ev.id} label={figLabel(i + 1)} ev={ev} preview={previews[ev.id]} />
          ))}
        </div>
      ) : (
        <p>{t('detail.noEvidence')}</p>
      )}

      <Heading>4.&nbsp;&nbsp;{t('rep.annex.history')}</Heading>
      <table className="w-full border-collapse text-[0.92em]">
        <thead>
          <tr>
            <th className={`${TH} w-36`}>{t('print.when')}</th>
            <th className={TH}>{t('print.action')}</th>
            <th className={TH}>{t('print.by')}</th>
            <th className={TH}>{t('print.notes')}</th>
          </tr>
        </thead>
        <tbody>
          {(inc.timeline || []).map((e, i) => (
            <tr key={i} className="break-inside-avoid">
              <td className={`${TD} whitespace-nowrap`}>{formatDateTime(e.date)}</td>
              <td className={TD}>{tv('timeline', e.action)}</td>
              <td className={TD}>{e.user}</td>
              <td className={`${TD} whitespace-pre-line wrap-anywhere`}>{e.notes || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {comments.length > 0 && (
        <>
          <Heading>5.&nbsp;&nbsp;{t('rep.annex.comments', { n: comments.length })}</Heading>
          <table className="w-full border-collapse text-[0.92em]">
            <tbody>
              {comments.map((c) => (
                <tr key={c.id} className="break-inside-avoid">
                  <td className={`${TD} w-44`}>
                    <span className="font-semibold">{c.user}</span>
                    <br />
                    {formatDateTime(c.date)}
                  </td>
                  <td className={`${TD} whitespace-pre-line wrap-anywhere`}>{c.body}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

export default function IncidentAnnex({ annex, previews, reference, docDate }) {
  const { t } = useI18n();
  const { incidents, total, truncated } = annex;

  return (
    <div>
      {incidents.map((inc, idx) => {
        const n = idx + 1;
        return (
          <section key={inc.id} className="mt-10 break-before-page border-t-2 border-dashed border-gray-300 pt-8 print:mt-0 print:border-0 print:pt-0">
            <p className="text-right text-[0.9em]">
              {t('rep.annex.to', { ref: reference || t('rep.doc.refPending'), date: docDate })}
            </p>
            <h3 className="mt-2 text-center text-[1.1em] font-bold">{t('rep.annex.title', { n })}</h3>
            <p className="text-center font-semibold">
              {inc.id} — {inc.title}
            </p>
            {idx === 0 && truncated && <p className="mt-2 text-center text-[0.9em]">{t('rep.annex.truncated', { n: incidents.length, total })}</p>}

            <IncidentRecord inc={inc} previews={previews} figLabel={(i) => t('rep.annex.fig', { n, i })} />
          </section>
        );
      })}
    </div>
  );
}
