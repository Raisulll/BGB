import { formatDateDisplay, formatDateTime } from '../../utils/helpers';
import { useI18n } from '../../i18n/I18nContext';
import IncidentAnnex from './IncidentAnnex';
import OfficialDocument, { Distribution, NUM, Section, SignatureBlock, Signatures, TD, TH } from './OfficialDocument';

// Specs #21, #22 — the generated report as a formal BGB document (frame in OfficialDocument):
// numbered paragraphs per template, certificate, signature blocks, distribution, optional Annex A.

// Sections per report template; the high-threat digest is already limited to High + Critical by the server
const SECTIONS = {
  operational: ['summary', 'category', 'sector', 'register'],
  statistical: ['summary', 'severity', 'category', 'sector'],
  'high-threat': ['summary', 'sector', 'register'],
  'sector-audit': ['summary', 'sector', 'category', 'register'],
};

const pct = (n, total) => (total ? `${((n / total) * 100).toFixed(1)}%` : '—');

// annex: { incidents, total, truncated } from /reports/details when the full details option is on
export default function OfficialReport({ report, printed, annex, previews }) {
  const { t, tv } = useI18n();
  const { meta, summary: s } = report;
  const f = meta.filters || {};
  const total = s.total;
  const sections = SECTIONS[meta.type] || SECTIONS.operational;
  const by = meta.generatedBy;

  const to = formatDateDisplay(f.dateTo || meta.generatedAt);
  const period = f.dateFrom ? t('rep.periodRange', { from: formatDateDisplay(f.dateFrom), to }) : t('rep.doc.periodUpTo', { to });
  const list = (v, kind) => {
    const values = Array.isArray(v) ? v : v ? [v] : [];
    return values.length ? values.map((x) => (kind ? tv(kind, x) : x)).join(', ') : t('rep.doc.all');
  };

  const categories = report.byCategory.filter((c) => c.count > 0);
  const sectors = report.bySector;
  const sectorTotals = sectors.reduce(
    (acc, r) => {
      for (const k of ['Low', 'Medium', 'High', 'Critical']) acc[k] += r.bySeverity[k] || 0;
      acc.total += r.total;
      acc.risk += r.riskScore;
      return acc;
    },
    { Low: 0, Medium: 0, High: 0, Critical: 0, total: 0, risk: 0 },
  );
  const highCritical = (s.bySeverity.High || 0) + (s.bySeverity.Critical || 0);

  let n = 1; // paragraph numbers follow the sections included in this template
  const body = {
    summary: () => (
      <Section key="summary" n={++n} title={t('rep.doc.s.summary')}>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={TH}>{t('rep.doc.description')}</th>
              <th className={`${TH} ${NUM} w-24`}>{t('rep.doc.number')}</th>
              <th className={`${TH} ${NUM} w-24`}>{t('rep.doc.share')}</th>
            </tr>
          </thead>
          <tbody>
            {[
              [t('rep.doc.sum.total'), total, true],
              [t('rep.doc.sum.highCritical'), highCritical],
              [t('rep.doc.sum.pending'), s.pendingReview],
              [t('rep.doc.sum.returned'), s.returned],
              [t('rep.doc.sum.approved'), s.approved],
              [t('rep.doc.sum.closed'), s.closed],
              [t('rep.doc.sum.rejected'), s.rejected],
              [t('rep.doc.sum.overdue'), s.overdue],
            ].map(([label, value, strong]) => (
              <tr key={label} className={strong ? 'font-semibold' : ''}>
                <td className={TD}>{label}</td>
                <td className={`${TD} ${NUM}`}>{value}</td>
                <td className={`${TD} ${NUM}`}>{strong ? '100.0%' : pct(value, total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    ),

    severity: () => (
      <Section key="severity" n={++n} title={t('rep.doc.s.severity')}>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={`${TH} w-12`}>{t('rep.doc.ser')}</th>
              <th className={TH}>{t('common.severity')}</th>
              <th className={`${TH} ${NUM} w-24`}>{t('rep.doc.incidents')}</th>
              <th className={`${TH} ${NUM} w-24`}>{t('rep.doc.share')}</th>
            </tr>
          </thead>
          <tbody>
            {report.bySeverity.map((r, i) => (
              <tr key={r.severity}>
                <td className={TD}>{i + 1}</td>
                <td className={TD}>{tv('severity', r.severity)}</td>
                <td className={`${TD} ${NUM}`}>{r.count}</td>
                <td className={`${TD} ${NUM}`}>{pct(r.count, total)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className={TD} colSpan={2}>{t('rep.doc.total')}</td>
              <td className={`${TD} ${NUM}`}>{total}</td>
              <td className={`${TD} ${NUM}`}>{total ? '100.0%' : '—'}</td>
            </tr>
          </tbody>
        </table>
      </Section>
    ),

    category: () => (
      <Section key="category" n={++n} title={t('rep.doc.s.category')}>
        {categories.length ? (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={`${TH} w-12`}>{t('rep.doc.ser')}</th>
                <th className={TH}>{t('common.category')}</th>
                <th className={`${TH} ${NUM} w-24`}>{t('rep.doc.incidents')}</th>
                <th className={`${TH} ${NUM} w-28`}>{t('rep.doc.highCritical')}</th>
                <th className={`${TH} ${NUM} w-24`}>{t('rep.doc.share')}</th>
              </tr>
            </thead>
            <tbody>
              {categories.flatMap((c, i) => [
                <tr key={c.category}>
                  <td className={TD}>{i + 1}</td>
                  <td className={`${TD} font-semibold`}>{c.category}</td>
                  <td className={`${TD} ${NUM}`}>{c.count}</td>
                  <td className={`${TD} ${NUM}`}>{c.highSeverity}</td>
                  <td className={`${TD} ${NUM}`}>{pct(c.count, total)}</td>
                </tr>,
                // The statistical summary breaks each category down by subcategory
                ...(meta.type === 'statistical'
                  ? c.subcategories.map((sub) => (
                      <tr key={`${c.category}/${sub.name}`} className="text-[0.92em]">
                        <td className={TD} />
                        <td className={`${TD} pl-6`}>{sub.name}</td>
                        <td className={`${TD} ${NUM}`}>{sub.count}</td>
                        <td className={TD} />
                        <td className={`${TD} ${NUM}`}>{pct(sub.count, total)}</td>
                      </tr>
                    ))
                  : []),
              ])}
              <tr className="font-semibold">
                <td className={TD} colSpan={2}>{t('rep.doc.total')}</td>
                <td className={`${TD} ${NUM}`}>{total}</td>
                <td className={`${TD} ${NUM}`}>{highCritical}</td>
                <td className={`${TD} ${NUM}`}>{total ? '100.0%' : '—'}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p>{t('rep.doc.none')}</p>
        )}
      </Section>
    ),

    sector: () => (
      <Section key="sector" n={++n} title={t('rep.doc.s.sector')}>
        {sectors.length ? (
          <>
            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full min-w-[34rem] border-collapse print:min-w-0">
                <thead>
                  <tr>
                    <th className={`${TH} w-12`}>{t('rep.doc.ser')}</th>
                    <th className={TH}>{t('common.sector')}</th>
                    {['Low', 'Medium', 'High', 'Critical'].map((sev) => (
                      <th key={sev} className={`${TH} ${NUM}`}>{tv('severity', sev)}</th>
                    ))}
                    <th className={`${TH} ${NUM}`}>{t('rep.doc.total')}</th>
                    <th className={`${TH} ${NUM}`}>{t('rep.doc.riskScore')}</th>
                    <th className={`${TH} ${NUM}`}>{t('rep.doc.share')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sectors.map((r, i) => (
                    <tr key={r.sector}>
                      <td className={TD}>{i + 1}</td>
                      <td className={`${TD} font-semibold`}>{r.sector}</td>
                      {['Low', 'Medium', 'High', 'Critical'].map((sev) => (
                        <td key={sev} className={`${TD} ${NUM}`}>{r.bySeverity[sev] || 0}</td>
                      ))}
                      <td className={`${TD} ${NUM}`}>{r.total}</td>
                      <td className={`${TD} ${NUM}`}>{r.riskScore}</td>
                      <td className={`${TD} ${NUM}`}>{pct(r.total, total)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className={TD} colSpan={2}>{t('rep.doc.total')}</td>
                    {['Low', 'Medium', 'High', 'Critical'].map((sev) => (
                      <td key={sev} className={`${TD} ${NUM}`}>{sectorTotals[sev]}</td>
                    ))}
                    <td className={`${TD} ${NUM}`}>{sectorTotals.total}</td>
                    <td className={`${TD} ${NUM}`}>{sectorTotals.risk}</td>
                    <td className={`${TD} ${NUM}`}>{total ? '100.0%' : '—'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-[0.85em]">{t('rep.doc.riskNote')}</p>
          </>
        ) : (
          <p>{t('rep.doc.none')}</p>
        )}
      </Section>
    ),

    register: () => (
      <section key="register" className="mt-5">
        <h3 className="mb-2 font-bold break-after-avoid">
          {++n}.&nbsp;&nbsp;<span className="underline underline-offset-2">{t('rep.doc.s.register')}</span>
        </h3>
        <div className="pl-6">
          {report.incidents.length ? (
            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full min-w-[44rem] border-collapse print:min-w-0 text-[0.92em]">
                <thead>
                  <tr>
                    <th className={`${TH} w-10`}>{t('rep.doc.ser')}</th>
                    <th className={TH}>{t('common.reference')}</th>
                    <th className={TH}>{t('rep.doc.date')}</th>
                    <th className={TH}>{t('common.title')}</th>
                    <th className={TH}>{t('common.category')}</th>
                    <th className={TH}>{t('rep.bnBop')}</th>
                    <th className={TH}>{t('common.severity')}</th>
                    <th className={TH}>{t('common.status')}</th>
                    {annex && <th className={TH}>{t('rep.annex.col')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {report.incidents.map((i, idx) => (
                    <tr key={i.id} className="break-inside-avoid">
                      <td className={`${TD} ${NUM}`}>{idx + 1}</td>
                      <td className={`${TD} whitespace-nowrap`}>{i.id}</td>
                      <td className={`${TD} whitespace-nowrap`}>{formatDateDisplay(i.date)}</td>
                      <td className={TD}>{i.title}</td>
                      <td className={TD}>{i.category}</td>
                      <td className={TD}>{[i.battalion, i.bop].filter(Boolean).join(' / ')}</td>
                      <td className={`${TD} ${i.severity === 'Critical' ? 'font-semibold' : ''}`}>{tv('severity', i.severity)}</td>
                      <td className={TD}>{tv('status', i.status)}</td>
                      {annex && <td className={`${TD} whitespace-nowrap`}>{idx < annex.incidents.length ? `A-${idx + 1}` : '—'}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>{t('rep.doc.none')}</p>
          )}
          {meta.truncated && <p className="mt-1 text-[0.85em]">{t('rep.doc.truncated', { n: report.incidents.length, total })}</p>}
        </div>
      </section>
    ),
  };

  const asAt = formatDateTime(meta.generatedAt);
  const docDate = formatDateDisplay(printed?.printedAt || meta.generatedAt);

  return (
    <OfficialDocument reference={printed?.reference} docDate={docDate} subject={t('rep.doc.subjectText', { type: t(`rep.type.${meta.type}`), period })}>
      {/* 1. Scope and parameters */}
      <Section n={1} title={t('rep.doc.s.scope')}>
        <p className="text-justify">
          {t('rep.doc.scopeText', { n: total, scope: by.scope, period })}
          {annex && ` ${t('rep.annex.intro')}`}
        </p>
        <table className="mt-2 w-full border-collapse">
          <tbody>
            {[
              [t('rep.doc.reportType'), t(`rep.type.${meta.type}`)],
              [t('rep.doc.period'), period],
              [t('common.sector'), list(f.sector)],
              [t('common.battalion'), list(f.battalion)],
              [t('common.category'), list(f.category)],
              [t('common.severity'), list(f.severity, 'severity')],
              [t('common.status'), list(f.status, 'status')],
              [t('rep.doc.dataScope'), by.scope],
              [t('rep.doc.asAt'), `${asAt} (BST)`],
            ].map(([label, value]) => (
              <tr key={label}>
                <th className={`${TH} w-48 font-semibold`}>{label}</th>
                <td className={TD}>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {sections.map((key) => body[key]())}

      <Section n={++n} title={t('rep.doc.s.certificate')}>
        <p className="text-justify">{t('rep.doc.certify', { time: asAt })}</p>
      </Section>

      <Signatures>
        <SignatureBlock
          title={t('rep.doc.preparedBy')}
          name={by.name}
          appointment={tv('role', by.role)}
          unit={by.scope}
          date={printed ? formatDateDisplay(printed.printedAt) : ''}
        />
        <SignatureBlock title={t('rep.doc.checkedBy')} />
        <SignatureBlock title={t('rep.doc.approvedBy')} />
      </Signatures>

      <Distribution />

      {printed && (
        <p className="mt-6 text-[0.8em]">
          {t('rep.doc.printedBy', { name: by.name, time: formatDateTime(printed.printedAt, { withSeconds: true }) })}
        </p>
      )}

      {annex && <IncidentAnnex annex={annex} previews={previews || {}} reference={printed?.reference} docDate={docDate} />}
    </OfficialDocument>
  );
}
