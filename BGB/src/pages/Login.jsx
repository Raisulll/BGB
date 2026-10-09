import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { useI18n } from '../i18n/I18nContext';
import LanguageSwitcher from '../components/layout/LanguageSwitcher';

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
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [showBannerInfo, setShowBannerInfo] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-y-auto bg-gradient-to-br from-[#07190a] via-[#0f3015] to-[#0a2310] p-4 sm:p-6 md:h-screen md:min-h-0 md:overflow-hidden md:p-8 lg:p-12 text-white font-sans">
      {/* Tactical Background Grid Pattern */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:24px_24px] opacity-40" />

      {/* Ambient Lighting Glow Orbs */}
      <div className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 sm:h-[28rem] sm:w-[28rem] rounded-full bg-bgb-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-20 h-80 w-80 sm:h-[32rem] sm:w-[32rem] rounded-full bg-bgb-300/15 blur-3xl" />

      {/* Main Container: Banner on top, Form at bottom on mobile/tablet */}
      <div className="relative z-10 flex w-full max-w-6xl flex-col justify-between gap-6 py-4 md:h-full md:flex-row md:items-center md:gap-10 lg:gap-14 md:py-6">
        {/* Left/Top Side: BGB Tactical Banner & Hero Section */}
        <div className="flex flex-col justify-between rounded-2xl border border-emerald-500/25 bg-emerald-950/40 p-4 sm:p-5 backdrop-blur-xl md:h-full md:flex-1 md:space-y-0 md:rounded-none md:border-none md:bg-transparent md:p-0 md:backdrop-blur-none shadow-xl md:shadow-none transition-all">
          {/* Top Logo & Title Badge Bar */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-white/15 p-2 backdrop-blur-md ring-1 ring-white/30 shadow-lg shrink-0">
                <img src="/bgb.png" alt="BGB Emblem" className="h-7 sm:h-10 w-auto drop-shadow-md" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg sm:text-2xl font-black tracking-widest text-white uppercase">BIRDS</h1>
                  <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300 ring-1 ring-emerald-400/30">v2.4 HQ</span>
                </div>
                <p className="text-[11px] sm:text-sm font-semibold text-bgb-200 tracking-wide">{t('login.org')}</p>
              </div>
            </div>

            {/* Mobile / Tablet Controls */}
            <div className="flex items-center gap-2">
              <LanguageSwitcher tone="dark" />
              <button
                type="button"
                onClick={() => setShowBannerInfo((prev) => !prev)}
                className="md:hidden flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-900/60 px-3 py-1 text-[11px] font-bold text-emerald-200 hover:bg-emerald-800/60 transition-all shadow-sm"
              >
                <i className="fas fa-info-circle text-emerald-400" />
                <span>{showBannerInfo ? t('login.hideOverview') : t('login.overview')}</span>
                <i className={`fas fa-chevron-${showBannerInfo ? 'up' : 'down'} text-[9px]`} />
              </button>

              <div className="hidden sm:inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-900/50 px-2.5 py-1 text-[10px] sm:text-xs font-bold text-emerald-300 backdrop-blur-md">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                <span>{t('login.portal')}</span>
              </div>
            </div>
          </div>

          {/* Hero Content */}
          <div className="my-3 md:my-auto space-y-2 sm:space-y-4 max-w-xl">
            <div className="hidden md:inline-flex items-center gap-2 rounded-full border border-bgb-300/30 bg-white/10 px-3.5 py-1 text-xs font-bold text-bgb-200 backdrop-blur-md tracking-wider">
              <i className="fas fa-shield-alt text-emerald-400 text-xs" />
              {t('login.tagline')}
            </div>

            <h2 className="text-base sm:text-2xl md:text-4xl lg:text-5xl font-extrabold leading-snug sm:leading-tight text-white">
              {t('login.systemName')}
            </h2>

            {/* Collapsible Overview & Feature Badges on Mobile/Tablet */}
            <div className={`space-y-3 transition-all duration-300 ${showBannerInfo ? 'block' : 'hidden md:block'}`}>
              <p className="text-xs sm:text-sm leading-relaxed text-bgb-100/90 font-medium pt-1">
                {t('login.intro')}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-950/40 p-2 sm:p-2.5 backdrop-blur-md">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300 text-xs shrink-0">
                    <i className="fas fa-map-marked-alt" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold text-white">{t('login.featGis')}</div>
                    <div className="text-[9px] text-emerald-200/70 font-mono truncate">{t('login.featGisSub')}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-950/40 p-2 sm:p-2.5 backdrop-blur-md">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300 text-xs shrink-0">
                    <i className="fas fa-tasks" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold text-white">{t('login.featApproval')}</div>
                    <div className="text-[9px] text-emerald-200/70 font-mono truncate">{t('login.featApprovalSub')}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-950/40 p-2 sm:p-2.5 backdrop-blur-md">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300 text-xs shrink-0">
                    <i className="fas fa-user-shield" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold text-white">{t('login.featAudit')}</div>
                    <div className="text-[9px] text-emerald-200/70 font-mono truncate">{t('login.featAuditSub')}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Footer Information (Desktop only) */}
          <div className="hidden md:flex items-center justify-between border-t border-emerald-500/20 pt-3 text-xs text-bgb-200/70 font-medium">
            <span>&copy; {new Date().getFullYear()} {t('login.copyright')}</span>
            <span className="flex items-center gap-1.5 text-emerald-300 font-mono text-[10px]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> {t('login.ready')}
            </span>
          </div>
        </div>

        {/* Right Side: Embedded Form Card */}
        <div className="w-full max-w-md shrink-0 mx-auto md:mx-0">
          <div className="rounded-3xl border border-white/20 bg-white/95 p-6 sm:p-8 text-gray-900 shadow-2xl backdrop-blur-2xl transition-all">
            {/* Form Header */}
            <div className="mb-5 flex items-center justify-between border-b border-gray-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-bgb-50 p-1 border border-bgb-200/60">
                  <img src="/bgb.png" alt="BGB Emblem" className="h-5 w-auto" />
                </div>
                <span className="text-xs font-extrabold tracking-wider text-bgb-900 uppercase">
                  {t('login.signInTitle')}
                </span>
              </div>
              {IS_HTTPS && (
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200/70 flex items-center gap-1">
                  <i className="fas fa-lock text-[9px]" /> {t('login.secure')}
                </span>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="login-username" className="form-label text-xs font-bold text-gray-700 mb-1">
                  {t('login.username')}
                </label>
                <div className="relative">
                  <i className="fas fa-user pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-bgb-600 text-xs" />
                  <input
                    id="login-username"
                    type="text"
                    className="form-input pl-10 text-sm border-gray-300 focus:border-bgb-600 focus:ring-4 focus:ring-bgb-600/15"
                    placeholder={t('login.usernamePh')}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="login-password" className="form-label text-xs font-bold text-gray-700">
                    {t('login.password')}
                  </label>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      showToast(t('login.forgotHint'), 'info');
                    }}
                    className="text-xs font-bold text-bgb-700 hover:text-bgb-900 hover:underline"
                  >
                    {t('login.forgot')}
                  </a>
                </div>
                <div className="relative">
                  <i className="fas fa-lock pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-bgb-600 text-xs" />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    className="form-input pl-10 pr-10 text-sm border-gray-300 focus:border-bgb-600 focus:ring-4 focus:ring-bgb-600/15"
                    placeholder={t('login.passwordPh')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                    className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'} text-xs`} />
                  </button>
                </div>
              </div>

              <button
                id="login-submit"
                type="submit"
                disabled={submitting}
                className="btn btn-primary w-full py-3 text-sm font-bold bg-gradient-to-r from-bgb-700 via-bgb-600 to-bgb-700 hover:from-bgb-800 hover:to-bgb-700 text-white shadow-lg shadow-bgb-700/25 rounded-xl transition-all"
              >
                {submitting ? (
                  <>
                    <i className="fas fa-spinner fa-spin mr-1 text-xs" /> {t('login.verifying')}
                  </>
                ) : (
                  <>
                    {t('login.submit')} <i className="fas fa-arrow-right ml-1 text-xs" />
                  </>
                )}
              </button>
            </form>

            {/* Quick Demo Selector */}
            {SHOW_DEMO_ACCOUNTS && (
            <div className="mt-5 border-t border-gray-100 pt-4">
              <button
                type="button"
                onClick={() => setShowDemo((s) => !s)}
                className="flex w-full items-center justify-between text-xs font-bold text-gray-600 hover:text-bgb-800 transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <i className="fas fa-key text-bgb-600 text-xs" /> {t('login.demoAccounts')}
                </span>
                <i className={`fas fa-chevron-${showDemo ? 'up' : 'down'} text-[10px] text-gray-400`} />
              </button>

              {showDemo ? (
                <div className="mt-2.5 grid grid-cols-2 gap-2 animate-fade-in">
                  {DEMO_ACCOUNTS.map((acc) => (
                    <button
                      key={acc.username}
                      type="button"
                      onClick={() => fillDemo(acc)}
                      className="rounded-xl border border-bgb-200/80 bg-bgb-50/60 p-2.5 text-left text-[11px] transition-all hover:bg-bgb-100/80 hover:border-bgb-300"
                    >
                      <span className="font-bold block text-bgb-900">{t(`login.demo.${acc.key}`)}</span>
                      <span className="text-gray-500 font-mono text-[10px] truncate block">{acc.username}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {DEMO_ACCOUNTS.map((acc) => (
                    <button
                      key={acc.username}
                      type="button"
                      onClick={() => fillDemo(acc)}
                      className="rounded-lg bg-bgb-50 px-2.5 py-1 text-[11px] font-semibold text-bgb-800 border border-bgb-200/60 hover:bg-bgb-100 hover:border-bgb-300 transition-all"
                    >
                      {t(`login.demo.${acc.key}`)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
