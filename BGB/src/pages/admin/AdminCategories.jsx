import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useToast } from '../../context/ToastContext';
import * as adminApi from '../../api/admin';
import { errorMessage } from '../../api/client';
import useApi from '../../hooks/useApi';
import Card from '../../components/ui/Card';
import ErrorState from '../../components/ui/ErrorState';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import { useI18n } from '../../i18n/I18nContext';

const splitList = (text) => [...new Set(text.split(/[\n,]/).map((s) => s.trim()).filter(Boolean))];

// Spec #6 — configurable categories and subcategories. Nothing is deleted: entries are
// deactivated so existing incidents keep their classification. A category already used by
// incidents can't be renamed (statistics are grouped by name); the server enforces this.
export default function AdminCategories() {
  const { reloadMeta } = useApp();
  const { showToast } = useToast();
  const { t } = useI18n();
  const { data, error, message, reload } = useApi(() => adminApi.getCategories(), []);
  const [dialog, setDialog] = useState(null); // { mode: 'new' } | { mode: 'edit', cat }
  const [name, setName] = useState('');
  const [subs, setSubs] = useState('');
  const [busy, setBusy] = useState(null);

  const done = (msg) => {
    showToast(msg, 'success');
    reload();
    reloadMeta().catch(() => {}); // incident form dropdowns
  };

  const run = async (key, fn, msg) => {
    setBusy(key);
    try {
      await fn();
      done(msg);
      return true;
    } catch (err) {
      showToast(errorMessage(err), 'error');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const openNew = () => {
    setName('');
    setSubs('');
    setDialog({ mode: 'new' });
  };
  const openEdit = (cat) => {
    setName(cat.name);
    setSubs('');
    setDialog({ mode: 'edit', cat });
  };

  const submit = async (e) => {
    e.preventDefault();
    const list = splitList(subs);
    let ok;
    if (dialog.mode === 'new') {
      ok = await run('save', () => adminApi.createCategory({ name: name.trim(), subcategories: list }), t('cat.created', { name: name.trim() }));
    } else {
      const patch = {};
      if (name.trim() !== dialog.cat.name) patch.name = name.trim();
      if (list.length) patch.addSubcategories = list;
      if (!Object.keys(patch).length) return setDialog(null);
      ok = await run('save', () => adminApi.updateCategory(dialog.cat.id, patch), t('cat.updated', { name: name.trim() }));
    }
    if (ok) setDialog(null);
  };

  if (error) return <Card><ErrorState message={message} onRetry={reload} /></Card>;
  if (!data) return <Spinner />;

  return (
    <Card
      title={t('cat.title')}
      icon="fa-tags"
      actions={
        <button onClick={openNew} className="btn btn-primary">
          <i className="fas fa-plus" /> {t('cat.add')}
        </button>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2">
        {data.map((cat) => (
          <div key={cat.id} className={`rounded-xl border p-4 transition-all hover:shadow-sm ${cat.isActive ? 'border-gray-200 bg-gray-50/50 hover:border-bgb-300' : 'border-dashed border-gray-300 bg-gray-100/60 opacity-75'}`}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h4 className="flex min-w-0 items-center gap-2 text-sm font-bold text-gray-800 sm:text-base">
                <span className={`h-2 w-2 shrink-0 rounded-full ${cat.isActive ? 'bg-bgb-600' : 'bg-gray-400'}`} />
                <span className="truncate">{cat.name}</span>
                {!cat.isActive && <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[9px] font-bold text-gray-600">{t('cat.inactive')}</span>}
              </h4>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="rounded border border-gray-200 bg-white px-2 py-0.5 font-mono text-xs font-semibold text-gray-500" title={t('cat.usage')}>
                  {cat.id} &bull; {cat.incidentCount}
                </span>
                <button type="button" onClick={() => openEdit(cat)} className="flex h-6 w-6 items-center justify-center rounded border border-gray-200 bg-white text-gray-400 transition-colors hover:bg-bgb-50 hover:text-bgb-600" title={t('cat.edit')} aria-label={t('cat.editAria', { name: cat.name })}>
                  <i className="fas fa-edit text-xs" />
                </button>
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => run(`cat-${cat.id}`, () => adminApi.updateCategory(cat.id, { isActive: !cat.isActive }), t(cat.isActive ? 'cat.deactivated' : 'cat.reactivated', { name: cat.name }))}
                  className={`flex h-6 w-6 items-center justify-center rounded border bg-white transition-colors ${cat.isActive ? 'border-gray-200 text-gray-400 hover:bg-red-50 hover:text-red-600' : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'}`}
                  title={cat.isActive ? t('cat.deactivateTitle') : t('cat.reactivateTitle')}
                  aria-label={t('cat.toggleAria', { action: cat.isActive ? t('users.deactivate') : t('users.reactivate'), name: cat.name })}
                >
                  <i className={`fas ${busy === `cat-${cat.id}` ? 'fa-spinner fa-spin' : cat.isActive ? 'fa-eye-slash' : 'fa-eye'} text-xs`} />
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {cat.subcategories.map((sub) => (
                <button
                  key={sub.name}
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    run(`sub-${cat.id}-${sub.name}`, () => adminApi.updateCategory(cat.id, { subcategoryStatus: [{ name: sub.name, isActive: !sub.isActive }] }), t(sub.isActive ? 'cat.deactivated' : 'cat.reactivated', { name: sub.name }))
                  }
                  className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${sub.isActive ? 'border-gray-200 bg-white text-gray-700 hover:border-red-200 hover:text-red-700' : 'border-dashed border-gray-300 bg-gray-100 text-gray-400 line-through hover:text-emerald-700'}`}
                  title={sub.isActive ? t('cat.subDeactivate') : t('cat.subReactivate')}
                >
                  {sub.name}
                  <i className={`fas ${sub.isActive ? 'fa-times' : 'fa-undo'} text-[9px]`} />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Modal open={Boolean(dialog)} title={dialog?.mode === 'new' ? t('cat.add') : t('cat.editTitle', { name: dialog?.cat?.name || '' })} icon="fa-tags" onClose={() => setDialog(null)} busy={busy === 'save'}>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label htmlFor="cat-name" className="form-label">{t('cat.name')} *</label>
            <input
              id="cat-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={dialog?.mode === 'edit' && dialog.cat.incidentCount > 0}
              className="form-input"
            />
            {dialog?.mode === 'edit' && dialog.cat.incidentCount > 0 && (
              <p className="mt-1 text-[11px] text-gray-500">{t('cat.inUse', { n: dialog.cat.incidentCount })}</p>
            )}
          </div>
          <div>
            <label htmlFor="cat-subs" className="form-label">{dialog?.mode === 'new' ? t('cat.subcategories') : t('cat.addSubcategories')}</label>
            <textarea id="cat-subs" rows={3} value={subs} onChange={(e) => setSubs(e.target.value)} placeholder={t('cat.subsPh')} className="form-input" />
          </div>
          <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
            <button type="button" onClick={() => setDialog(null)} className="btn btn-secondary">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={busy === 'save'} className="btn btn-primary">
              {busy === 'save' && <i className="fas fa-spinner fa-spin" />} {t('common.save')}
            </button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}
