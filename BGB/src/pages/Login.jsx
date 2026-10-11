import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { useI18n } from '../i18n/I18nContext';
import LanguageSwitcher from '../components/layout/LanguageSwitcher';
import useOnline from '../hooks/useOnline';

const DEMO_ACCOUNTS = [
  { key: 'admin', username: 'hq_admin', password: 'Admin@123' },
  { key: 'sector', username: 'sector_off', password: 'Sector@123' },
  { key: 'operator', username: 'batt_op', password: 'Batt@123' },
  { key: 'verifier', username: 'verifier', password: 'Verify@123' },
  { key: 'auditor', username: 'auditor', password: 'Audit@123' },
];
// Demo shortcuts never ship to production unless explicitly enabled for a TEC demonstration (spec #49)
const SHOW_DEMO_ACCOUNTS = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_ACCOUNTS === 'true';
const IS_HTTPS = typeof window !== 'undefined' && window.location.protocol === 'https:';

export default function Login() {
  const { login } = useApp();
  const { showToast } = useToast();
  const { t } = useI18n();
  const online = useOnline();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      showToast(t('login.missing'), 'error');
      return;
    }
    setSubmitting(true);
    const { user, error } = await login(username, password);
    setSubmitting(false);
    if (user) {
      setPassword('');
      showToast(t('login.welcome', { name: user.name }), 'success');
      navigate(user.mustChangePassword ? '/change-password' : location.state?.from?.pathname || '/', { replace: true });
    } else {
      showToast(error, 'error');
    }
  };

  const fillDemo = (acc) => {
    setUsername(acc.username);
    setPassword(acc.password);
    showToast(t('login.demoLoaded', { label: t(`login.demo.${acc.key}`) }), 'info');
  };

  // One dark-green banner: who this system belongs to on the left, the sign-in card on the right.
  // Stacked on phones and tablets.
  return (
    <div className="flex min-h-screen w-full flex-col bg-bgb-900 text-white">
      <div className="flex justify-end px-6 pt-5 sm:px-10">
        <LanguageSwitcher tone="dark" />
      </div>

      <div className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 items-center gap-10 px-6 py-8 sm:px-10 lg:grid-cols-2 lg:gap-16 lg:py-12">
        {/* Organisation */}
        <section>
          <div className="flex items-center gap-3">
            <img src="/bgb.png" alt={t('nav.crestAlt')} className="h-14 w-14 shrink-0 object-contain lg:h-16 lg:w-16" />
            <div>
              <p className="text-base font-semibold leading-tight lg:text-lg">{t('login.org')}</p>
              <p className="text-sm text-bgb-100">{t('login.hq')}</p>
            </div>
          </div>
          <h1 className="mt-6 text-2xl font-semibold leading-snug sm:text-3xl lg:mt-10 lg:text-4xl lg:leading-tight">{t('login.systemName')}</h1>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-bgb-100">{t('login.about')}</p>
          <div className="mt-8 hidden max-w-xl border-t border-white/20 pt-5 text-sm text-bgb-100 lg:block">
            <p className="leading-relaxed">{t('login.notice')}</p>
            <p className="mt-3 text-bgb-200">
              &copy; {new Date().getFullYear()} {t('login.copyright')}
            </p>
          </div>
        </section>

        {/* Sign-in card */}
        <section className="w-full lg:flex lg:justify-end">
          <div className="w-full rounded-lg bg-white p-6 text-slate-900 shadow-lg sm:p-8 lg:max-w-md">
            <h2 className="text-2xl font-semibold">{t('login.signInTitle')}</h2>
            <p className="mt-1 text-sm text-slate-600">{t('login.signInHint')}</p>

            {!online && (
              <p role="status" className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <i className="fas fa-wifi mr-2" aria-hidden="true" />
                {t('pwa.offlineSignIn')}
              </p>
            )}
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label htmlFor="login-username" className="mb-1 block text-sm font-medium text-slate-800">
                  {t('login.username')}
                </label>
                <input
                  id="login-username"
                  type="text"
                  autoComplete="username"
                  className="form-input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>

              <div>
                <label htmlFor="login-password" className="mb-1 block text-sm font-medium text-slate-800">
                  {t('login.password')}
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    className="form-input pr-16"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                    aria-pressed={showPassword}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bgb-700"
                  >
                    {showPassword ? t('login.hide') : t('login.show')}
                  </button>
                </div>
              </div>

              <button id="login-submit" type="submit" disabled={submitting} className="btn btn-primary w-full">
                {submitting && <i className="fas fa-spinner fa-spin" aria-hidden="true" />}
                {submitting ? t('login.verifying') : t('login.submit')}
              </button>

              <div className="text-sm">
                <button type="button" onClick={() => setShowForgot((v) => !v)} aria-expanded={showForgot} className="font-medium text-bgb-700 underline-offset-2 hover:underline">
                  {t('login.forgot')}
                </button>
                {showForgot && <p className="mt-1 text-slate-600">{t('login.forgotHint')}</p>}
              </div>
            </form>

            {/* Demo shortcuts: development builds, or a TEC demo with VITE_SHOW_DEMO_ACCOUNTS=true */}
            {SHOW_DEMO_ACCOUNTS && (
              <div className="mt-6 border-t border-slate-200 pt-4">
                <p className="text-sm font-medium text-slate-800">{t('login.demoAccounts')}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {DEMO_ACCOUNTS.map((acc) => (
                    <button key={acc.username} type="button" onClick={() => fillDemo(acc)} className="btn btn-sm btn-secondary">
                      {t(`login.demo.${acc.key}`)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {IS_HTTPS && <p className="mt-4 text-xs text-slate-500">{t('login.secure')}</p>}
          </div>
        </section>

        {/* On phones and tablets the notice follows the form */}
        <div className="text-xs leading-relaxed text-bgb-100 lg:hidden">
          <p>{t('login.notice')}</p>
          <p className="mt-2 text-bgb-200">
            &copy; {new Date().getFullYear()} {t('login.copyright')}
          </p>
        </div>
      </div>
    </div>
  );
}
