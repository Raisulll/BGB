import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useToast } from '../../context/ToastContext';
import * as adminApi from '../../api/admin';
import { errorMessage } from '../../api/client';
import Card from '../../components/ui/Card';
import { useI18n } from '../../i18n/I18nContext';

// Spec #9 — organizational hierarchy HQ → Sector → Battalion → BOP. Units are add-only: incidents
// and user scopes refer to them by name. The server checks that a battalion stays in one sector and
// that names are unique across levels.
export default function AdminOrg({ org, onChange }) {
  const { reloadMeta } = useApp();
  const { showToast } = useToast();
  const { t } = useI18n();
  const [form, setForm] = useState({ sector: '', battalion: '', bop: '' });
  const [busy, setBusy] = useState(false);
  const hierarchy = org.hierarchy;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { sector: form.sector.trim(), battalion: form.battalion.trim(), bop: form.bop.trim() };
      onChange(await adminApi.addOrgUnit(body));
      reloadMeta().catch(() => {});
      showToast(t('org.added', body), 'success');
      setForm((f) => ({ ...f, bop: '' }));
    } catch (err) {
      showToast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 items-start gap-4 sm:gap-6 lg:grid-cols-3">
      <Card title={t('org.title', { n: org.units.length })} icon="fa-sitemap" className="lg:col-span-2">
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-bgb-900">
            <i className="fas fa-flag text-bgb-600" /> {org.hq}
          </div>
          {Object.entries(hierarchy).map(([sector, bns]) => (
            <div key={sector} className="ml-3 border-l-2 border-bgb-200 pl-4">
              <p className="mb-2 flex items-center gap-2 text-sm font-bold text-gray-800">
                <i className="fas fa-layer-group text-xs text-bgb-600" /> {sector}
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {Object.entries(bns).map(([bn, { BOPs }]) => (
                  <div key={bn} className="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
                    <p className="mb-1.5 text-xs font-bold text-gray-700">
                      <i className="fas fa-shield-alt mr-1.5 text-bgb-600" />
                      {bn}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {BOPs.map((b) => (
                        <span key={b} className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[11px] text-gray-600">
                          {b}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title={t('org.addUnit')} icon="fa-plus-circle">
        <form onSubmit={add} className="space-y-3">
          <div>
            <label htmlFor="org-sector" className="form-label">{t('common.sector')} *</label>
            <input id="org-sector" list="org-sectors" required value={form.sector} onChange={set('sector')} placeholder={t('org.sectorPh')} className="form-input" />
            <datalist id="org-sectors">
              {Object.keys(hierarchy).map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>
          <div>
            <label htmlFor="org-bn" className="form-label">{t('common.battalion')} *</label>
            <input id="org-bn" list="org-bns" required value={form.battalion} onChange={set('battalion')} placeholder={t('org.battalionPh')} className="form-input" />
            <datalist id="org-bns">
              {Object.keys(hierarchy[form.sector] || {}).map((b) => <option key={b} value={b} />)}
            </datalist>
          </div>
          <div>
            <label htmlFor="org-bop" className="form-label">{t('common.bop')} *</label>
            <input id="org-bop" required value={form.bop} onChange={set('bop')} placeholder={t('org.bopPh')} className="form-input" />
          </div>
          <p className="text-[11px] text-gray-500">{t('org.addOnly')}</p>
          <button type="submit" disabled={busy} className="btn btn-primary w-full">
            <i className={`fas ${busy ? 'fa-spinner fa-spin' : 'fa-plus'}`} /> {t('org.addBop')}
          </button>
        </form>
      </Card>
    </div>
  );
}
