import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { errorMessage } from '../api/client';
import { validatePassword } from '../utils/helpers';
import Card from '../components/ui/Card';

// Spec #29 — change own password. Also the forced first step after an admin reset or for a new
// account (users.must_change_password): the server allows nothing else until it is done.
export default function ChangePassword() {
  const { currentUser, policy, changePassword } = useApp();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const forced = Boolean(currentUser?.mustChangePassword);
  const rules = policy.password;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const policyError = validatePassword(form.next, rules);
    if (policyError) return setError(policyError);
    if (form.next !== form.confirm) return setError('The new passwords do not match');
    if (form.next === form.current) return setError('The new password must differ from the current one');
    setError('');
    setSaving(true);
    try {
      await changePassword(form.current, form.next);
      showToast('Password changed. Your other sessions have been signed out.', 'success');
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const ruleList = [
    `At least ${rules.minLength} characters`,
    rules.requireUppercase && 'An uppercase letter',
    rules.requireNumber && 'A number',
    rules.requireSpecial && 'A special character',
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      {forced && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <i className="fas fa-exclamation-triangle mt-0.5" />
          <p>You must set a new password before using BIRDS. Your current password was issued by an administrator.</p>
        </div>
      )}
      <Card title="Change Password" icon="fa-key">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="pwd-current" className="form-label">Current password</label>
            <input id="pwd-current" type="password" autoComplete="current-password" className="form-input" value={form.current} onChange={set('current')} required />
          </div>
          <div>
            <label htmlFor="pwd-new" className="form-label">New password</label>
            <input id="pwd-new" type="password" autoComplete="new-password" className="form-input" value={form.next} onChange={set('next')} required />
          </div>
          <div>
            <label htmlFor="pwd-confirm" className="form-label">Confirm new password</label>
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
                Cancel
              </button>
            )}
            <button type="submit" disabled={saving} className="btn btn-primary">
              <i className={`fas ${saving ? 'fa-spinner fa-spin' : 'fa-save'}`} /> Change Password
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
