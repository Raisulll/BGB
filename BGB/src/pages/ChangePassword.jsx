import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { errorMessage } from '../api/client';
import { validatePassword } from '../utils/helpers';
import Card from '../components/ui/Card';
import { useI18n } from '../i18n/I18nContext';

// Spec #29 — change own password. Also the forced first step after an admin reset or for a new
// account (users.must_change_password): the server allows nothing else until it is done.
export default function ChangePassword() {
  const { currentUser, policy, changePassword } = useApp();
  const { showToast } = useToast();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const forced = Boolean(currentUser?.mustChangePassword);
  const rules = policy.password;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const policyError = validatePassword(form.next, rules, t);
    if (policyError) return setError(policyError);
    if (form.next !== form.confirm) return setError(t('password.mismatch'));
    if (form.next === form.current) return setError(t('password.same'));
    setError('');
    setSaving(true);
    try {
      await changePassword(form.current, form.next);
      showToast(t('password.done'), 'success');
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const ruleList = [
    t('password.ruleLength', { n: rules.minLength }),
    rules.requireUppercase && t('password.ruleUpper'),
    rules.requireNumber && t('password.ruleNumber'),
    rules.requireSpecial && t('password.ruleSpecial'),
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      {forced && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <i className="fas fa-exclamation-triangle mt-0.5" />
          <p>{t('password.forced')}</p>
        </div>
      )}
      <Card title={t('password.title')} icon="fa-key">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="pwd-current" className="form-label">{t('password.current')}</label>
            <input id="pwd-current" type="password" autoComplete="current-password" className="form-input" value={form.current} onChange={set('current')} required />
          </div>
          <div>
            <label htmlFor="pwd-new" className="form-label">{t('password.new')}</label>
            <input id="pwd-new" type="password" autoComplete="new-password" className="form-input" value={form.next} onChange={set('next')} required />
          </div>
          <div>
            <label htmlFor="pwd-confirm" className="form-label">{t('password.confirm')}</label>
            <input id="pwd-confirm" type="password" autoComplete="new-password" className="form-input" value={form.confirm} onChange={set('confirm')} required />
          </div>

          <ul className="space-y-1 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
            {ruleList.map((r) => (
              <li key={r}>
                <i className="fas fa-check-circle mr-2 text-bgb-500" />
                {r}
              </li>
            ))}
          </ul>

          {error && (
            <p role="alert" className="text-sm font-medium text-red-600">
              <i className="fas fa-times-circle mr-1" />
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            {!forced && (
              <button type="button" onClick={() => navigate(-1)} className="btn btn-secondary">
                {t('common.cancel')}
              </button>
            )}
            <button type="submit" disabled={saving} className="btn btn-primary">
              <i className={`fas ${saving ? 'fa-spinner fa-spin' : 'fa-save'}`} /> {t('password.title')}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
