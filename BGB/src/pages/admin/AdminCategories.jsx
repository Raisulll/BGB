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
  const [subActive, setSubActive] = useState({}); // name -> active, for the category being edited
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
    setSubActive(Object.fromEntries(cat.subcategories.map((x) => [x.name, x.isActive])));
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
      const changed = dialog.cat.subcategories.filter((x) => subActive[x.name] !== x.isActive).map((x) => ({ name: x.name, isActive: subActive[x.name] }));
      if (changed.length) patch.subcategoryStatus = changed;
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
          <div key={cat.id} className={`rounded-md border p-4 ${cat.isActive ? 'border-slate-200 bg-white' : 'border-dashed border-slate-300 bg-slate-50'}`}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h4 className="flex min-w-0 items-center gap-2 text-base font-semibold text-slate-900">
                <span className="truncate">{cat.name}</span>
                {!cat.isActive && <span className="rounded bg-gray-200 px-1.5 py-0.5 text-xs font-bold text-gray-600">{t('cat.inactive')}</span>}
              </h4>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="text-xs text-slate-600" title={t('cat.usage')}>
                  {cat.id} · {t('cat.usedBy', { n: cat.incidentCount })}
                </span>
                <button type="button" onClick={() => openEdit(cat)} className="btn btn-sm btn-secondary" aria-label={t('cat.editAria', { name: cat.name })}>
                  {t('common.edit')}
                </button>
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => run(`cat-${cat.id}`, () => adminApi.updateCategory(cat.id, { isActive: !cat.isActive }), t(cat.isActive ? 'cat.deactivated' : 'cat.reactivated', { name: cat.name }))}
                  className={`btn btn-sm ${cat.isActive ? 'btn-danger-outline' : 'btn-secondary'}`}
                  aria-label={t('cat.toggleAria', { action: cat.isActive ? t('users.deactivate') : t('users.reactivate'), name: cat.name })}
                >
                  {busy === `cat-${cat.id}` && <i className="fas fa-spinner fa-spin" aria-hidden="true" />}
                  {cat.isActive ? t('users.deactivate') : t('users.reactivate')}
                </button>
              </div>
            </div>
            <ul className="flex flex-wrap gap-1.5 pt-1">
              {cat.subcategories.map((sub) => (
                <li
                  key={sub.name}
                  className={`rounded border px-2 py-0.5 text-xs ${sub.isActive ? 'border-slate-200 bg-white text-slate-800' : 'border-dashed border-slate-300 bg-slate-50 text-slate-500 line-through'}`}
                  title={sub.isActive ? undefined : t('cat.inactive')}
                >
                  {sub.name}
                </li>
              ))}
            </ul>
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
              <p className="mt-1 text-xs text-gray-500">{t('cat.inUse', { n: dialog.cat.incidentCount })}</p>
            )}
          </div>
          {dialog?.mode === 'edit' && dialog.cat.subcategories.length > 0 && (
            <fieldset>
              <legend className="form-label">{t('cat.subcategoriesActive')}</legend>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {dialog.cat.subcategories.map((x) => (
                  <label key={x.name} className="flex items-center gap-2 text-sm text-slate-800">
                    <input
                      type="checkbox"
                      checked={Boolean(subActive[x.name])}
                      onChange={(e) => setSubActive((m) => ({ ...m, [x.name]: e.target.checked }))}
                      className="h-4 w-4 accent-bgb-700"
                    />
                    {x.name}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
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
