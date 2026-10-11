import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/I18nContext';
import Avatar from './Avatar';

/** "m:ss" (or "h:mm:ss") from seconds. */
export const formatDuration = (seconds) => {
  const s = Math.max(0, Math.round(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};

function Timer({ since }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="font-mono tabular-nums">{formatDuration((now - since) / 1000)}</span>;
}

/**
 * The live call: incoming (answer / decline), ringing, connecting and in-call (mute / hang up).
 * Fixed at the bottom right so it stays visible while the user moves between pages.
 */
export default function CallPanel({ call, soundBlocked, audioHealth, onEnableSound, onAccept, onDecline, onHangUp, onToggleMute }) {
  const { t, tv } = useI18n();
  const { phase, other, muted, answeredAt } = call;
  const incoming = phase === 'incoming';

  const status =
    phase === 'incoming'
      ? t('calls.incoming')
      : phase === 'starting'
        ? t('calls.starting')
        : phase === 'outgoing'
          ? t('calls.ringing')
          : phase === 'connecting'
            ? t('calls.connecting')
            : null;

  return (
    <div
      role={incoming ? 'alertdialog' : 'status'}
      aria-live="assertive"
      aria-label={incoming ? t('calls.incomingFrom', { name: other?.name }) : t('calls.callWith', { name: other?.name })}
      className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-[95] rounded-lg border border-slate-300 bg-white p-4 shadow-xl sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-80 print:hidden"
    >
      <div className="flex items-center gap-3">
        <Avatar name={other?.name} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{other?.name}</p>
          <p className="truncate text-xs text-slate-500">
            {[tv('role', other?.role), other?.scope].filter(Boolean).join(' · ')}
          </p>
          <p className="mt-0.5 text-xs font-medium text-bgb-700">
            {status || (answeredAt ? <Timer since={answeredAt} /> : t('calls.connecting'))}
            {muted && <span className="ml-2 text-amber-700">{t('calls.muted')}</span>}
          </p>
        </div>
      </div>

      {/* Sound problems, in plain words */}
      {soundBlocked && (
        <button type="button" onClick={onEnableSound} className="btn btn-primary mt-3 w-full">
          <i className="fas fa-volume-high" aria-hidden="true" />
          {t('calls.turnOnSound')}
        </button>
      )}
      {phase === 'active' && audioHealth && (!audioHealth.incoming || !audioHealth.outgoing) && (
        <p role="alert" className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {!audioHealth.incoming && <span className="block">{t('calls.noSoundIn', { name: other?.name })}</span>}
          {!audioHealth.outgoing && !muted && <span className="block">{t('calls.noSoundOut')}</span>}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        {incoming ? (
          <>
            <button type="button" onClick={onDecline} className="btn btn-danger-outline flex-1">
              <i className="fas fa-phone-slash" aria-hidden="true" />
              {t('calls.decline')}
            </button>
            <button type="button" onClick={onAccept} className="btn btn-primary flex-1" autoFocus>
              <i className="fas fa-phone" aria-hidden="true" />
              {t('calls.answer')}
            </button>
          </>
        ) : (
          <>
            {(phase === 'active' || phase === 'connecting') && (
              <button type="button" onClick={onToggleMute} className="btn btn-secondary flex-1" aria-pressed={muted}>
                <i className={`fas ${muted ? 'fa-microphone' : 'fa-microphone-slash'}`} aria-hidden="true" />
                {muted ? t('calls.unmute') : t('calls.mute')}
              </button>
            )}
            <button type="button" onClick={onHangUp} className="btn btn-danger-outline flex-1">
              <i className="fas fa-phone-slash" aria-hidden="true" />
              {phase === 'starting' || phase === 'outgoing' ? t('common.cancel') : t('calls.hangUp')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
