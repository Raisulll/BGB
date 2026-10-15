import { useEffect, useState } from 'react';
import useMediaQuery from '../../hooks/useMediaQuery';
import { useI18n } from '../../i18n/I18nContext';
import { phoneRoutes } from '../../utils/audioDevices';
import { cn } from '../../utils/helpers';
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

const QUALITY_STYLE = { good: 'text-slate-600', fair: 'text-amber-800', poor: 'text-red-700' };

/** A labelled control in the in-call grid; a pressed one (muted, on hold) also changes its words. */
function Control({ icon, label, pressed, onClick, disabled, expanded }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      aria-expanded={expanded}
      className={cn('btn btn-secondary min-h-14 flex-col gap-1 px-1 py-1.5 text-xs', (pressed || expanded) && 'border-slate-500 bg-slate-100')}
    >
      <i className={`fas ${icon} text-base`} aria-hidden="true" />
      <span className="leading-tight">{label}</span>
    </button>
  );
}

/** Microphone, sound output and volume. */
function AudioSettings({ audio, onSetInput, onSetOutput, onChooseOutput, onSetVolume }) {
  const { t } = useI18n();
  return (
    <div className="mt-3 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      {audio.inputs.length > 0 && (
        <label className="block text-xs font-medium text-slate-700">
          {t('calls.microphone')}
          <select value={audio.inputId} onChange={(e) => onSetInput(e.target.value)} className="form-input mt-1 w-full text-sm">
            {!audio.inputs.some((d) => d.deviceId === audio.inputId) && <option value="">{t('calls.deviceDefault')}</option>}
            {audio.inputs.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {audio.outputs.length > 0 ? (
        <label className="block text-xs font-medium text-slate-700">
          {t('calls.output')}
          <select value={audio.outputId} onChange={(e) => onSetOutput(e.target.value)} className="form-input mt-1 w-full text-sm">
            {!audio.outputs.some((d) => d.deviceId === audio.outputId) && <option value="">{t('calls.deviceDefault')}</option>}
            {audio.outputs.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
      ) : audio.canChooseOutput && audio.canPickOutput ? (
        <button type="button" onClick={onChooseOutput} className="btn btn-secondary btn-sm w-full">
          <i className="fas fa-headphones" aria-hidden="true" />
          {t('calls.chooseOutput')}
        </button>
      ) : (
        <p className="text-xs text-slate-600">{t('calls.outputByDevice')}</p>
      )}
      <label className="block text-xs font-medium text-slate-700">
        {t('calls.volume')} <span className="font-normal text-slate-500">{Math.round(audio.volume * 100)}%</span>
        <input type="range" min="0" max="100" step="5" value={Math.round(audio.volume * 100)} onChange={(e) => onSetVolume(Number(e.target.value) / 100)} className="mt-1 w-full accent-bgb-700" />
      </label>
    </div>
  );
}

const REPLIES = ['busy', 'duty', 'later'];

/** Round call button with its name under it (Answer, Decline, Hang up on the full screen). */
function RoundButton({ icon, label, tone, onClick, autoFocus }) {
  return (
    <button
      type="button"
      onClick={onClick}
      autoFocus={autoFocus}
      className="group flex flex-col items-center gap-2 rounded-lg p-1 text-sm font-medium text-slate-800 focus-visible:ring-2 focus-visible:ring-bgb-700 focus-visible:outline-none"
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex h-16 w-16 items-center justify-center rounded-full text-2xl transition-colors',
          tone === 'answer'
            ? 'bg-bgb-700 text-white group-hover:bg-bgb-800'
            : tone === 'end'
              ? 'bg-red-700 text-white group-hover:bg-red-800'
              : 'border border-slate-300 bg-white text-slate-700 group-hover:bg-slate-50',
        )}
      >
        <i className={`fas ${icon}`} />
      </span>
      {label}
    </button>
  );
}

/**
 * The incoming call screen: the whole screen on a phone, a dialog over the page on a computer.
 * Decline, Answer, or decline with a ready reply sent in the chat.
 */
function IncomingScreen({ other, phone, onAccept, onDecline, onDeclineWithMessage }) {
  const { t, tv } = useI18n();
  const [replying, setReplying] = useState(false);
  const name = other?.name;
  const card = (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="incoming-call-name"
      aria-describedby="incoming-call-what"
      className={cn(
        'flex flex-col items-center bg-white text-center',
        phone ? 'h-full w-full justify-between px-6 pt-[calc(3rem+env(safe-area-inset-top))] pb-[calc(2.5rem+env(safe-area-inset-bottom))]' : 'w-[22rem] rounded-lg border border-slate-300 p-6 shadow-xl',
      )}
    >
      <div className="flex flex-col items-center">
        <p id="incoming-call-what" className="text-sm font-medium text-bgb-700">
          <i className="fas fa-phone mr-1.5" aria-hidden="true" />
          {t('calls.incomingAudio')}
        </p>
        <Avatar name={name} size={phone ? '2xl' : 'xl'} className="mt-6" />
        <h2 id="incoming-call-name" className="mt-4 text-2xl font-semibold wrap-anywhere text-slate-900">
          {name}
        </h2>
        <p className="mt-1 text-sm text-slate-600">{[tv('role', other?.role), other?.scope].filter(Boolean).join(' · ')}</p>
      </div>

      {replying ? (
        <div className={cn('w-full', phone ? '' : 'mt-6')}>
          <p className="mb-2 text-sm font-medium text-slate-700">{t('calls.replyTitle')}</p>
          <div className="space-y-2">
            {REPLIES.map((r) => (
              <button key={r} type="button" onClick={() => onDeclineWithMessage(t(`calls.reply.${r}`))} className="btn btn-secondary w-full justify-start text-left">
                <i className="fas fa-comment" aria-hidden="true" />
                {t(`calls.reply.${r}`)}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setReplying(false)} className="btn btn-ghost mt-2 w-full">
            {t('common.back')}
          </button>
        </div>
      ) : (
        <div className={cn('flex w-full items-start justify-around', phone ? '' : 'mt-8')}>
          <RoundButton icon="fa-phone-slash" label={t('calls.decline')} tone="end" onClick={onDecline} />
          <RoundButton icon="fa-comment" label={t('calls.message')} onClick={() => setReplying(true)} />
          <RoundButton icon="fa-phone" label={t('calls.answer')} tone="answer" onClick={onAccept} autoFocus />
        </div>
      )}
    </div>
  );
  return <div className={cn('fixed inset-0 z-[96] flex items-center justify-center print:hidden', phone ? 'bg-white' : 'bg-slate-900/50 p-4')}>{card}</div>;
}

/**
 * The live call: incoming (full call screen), ringing, connecting and in-call. In-call controls:
 * mute, speaker/earpiece (where the phone names both), hold, audio settings (microphone, output,
 * volume), open chat, hang up. On a phone the call fills the screen and can be minimised to a bar;
 * on a computer it is a card at the bottom right, so the user can keep working while talking.
 */
export default function CallPanel({
  call,
  soundBlocked,
  audioHealth,
  quality,
  remoteState,
  audio,
  onEnableSound,
  onAccept,
  onDecline,
  onDeclineWithMessage,
  onHangUp,
  onToggleMute,
  onToggleHold,
  onOpenChat,
  onSetInput,
  onSetOutput,
  onChooseOutput,
  onSetVolume,
}) {
  const { t, tv } = useI18n();
  const phone = useMediaQuery('(max-width: 639px)');
  const { phase, other, muted, held, answeredAt, reach } = call;
  const incoming = phase === 'incoming';
  const live = phase === 'active' || phase === 'connecting';
  const [minimised, setMinimised] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const name = other?.name;
  const fullScreen = incoming || (phone && !minimised);

  // Nothing scrolls behind a full call screen
  useEffect(() => {
    if (!fullScreen) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = before;
    };
  }, [fullScreen]);

  if (incoming) return <IncomingScreen other={other} phone={phone} onAccept={onAccept} onDecline={onDecline} onDeclineWithMessage={onDeclineWithMessage} />;

  const routes = phoneRoutes(audio.outputs);
  const onSpeaker = routes && audio.outputId === routes.speaker.deviceId;
  const cancelOnly = phase === 'starting' || phase === 'outgoing';

  const status = phase === 'starting' ? t('calls.starting') : phase === 'outgoing' ? t('calls.ringing') : phase === 'connecting' ? t('calls.connecting') : null;
  const clock = status || (answeredAt ? <Timer since={answeredAt} /> : t('calls.connecting'));
  const flags = (
    <>
      {muted && <span className="ml-2 text-amber-800">{t('calls.muted')}</span>}
      {held && <span className="ml-2 text-amber-800">{t('calls.onHold')}</span>}
    </>
  );

  const hangUpButton = (extra) => (
    <button type="button" onClick={onHangUp} className={cn('btn btn-danger-outline', extra)}>
      <i className="fas fa-phone-slash" aria-hidden="true" />
      {cancelOnly ? t('common.cancel') : t('calls.hangUp')}
    </button>
  );

  // Minimised: one line with the person, the time and Hang up
  if (minimised) {
    return (
      <div
        role="status"
        aria-label={t('calls.callWith', { name })}
        className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-[95] flex items-center gap-2 rounded-lg border border-slate-300 bg-white p-2 shadow-xl sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-80 print:hidden"
      >
        <Avatar name={name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{name}</p>
          <p className="truncate text-xs text-bgb-700">
            {clock}
            {flags}
          </p>
        </div>
        <button type="button" onClick={() => setMinimised(false)} className="btn btn-secondary btn-sm">
          <i className="fas fa-up-right-and-down-left-from-center" aria-hidden="true" />
          {t('calls.show')}
        </button>
        {hangUpButton('btn-sm')}
      </div>
    );
  }

  const notices = (
    <>
      {/* While ringing: say plainly when the other person cannot receive the call right now */}
      {phase === 'outgoing' && reach && reach !== 'online' && (
        <p role="status" className={`mt-3 rounded-md border px-3 py-2 text-left text-xs ${reach === 'offline' ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
          <i className={`fas ${reach === 'offline' ? 'fa-user-slash' : 'fa-mobile-screen'} mr-1.5`} aria-hidden="true" />
          {reach === 'offline' ? t('calls.reachOffline', { name }) : t('calls.reachPush', { name })}
        </p>
      )}

      {/* What the other side did, and this side's hold */}
      {phase === 'active' && (held || remoteState.held || remoteState.muted) && (
        <p role="status" className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs text-slate-700">
          {held ? t('calls.heldNotice', { name }) : remoteState.held ? t('calls.remoteHeld', { name }) : t('calls.remoteMuted', { name })}
        </p>
      )}

      {/* Sound problems, in plain words (not while either side is muted or holding on purpose) */}
      {soundBlocked && (
        <button type="button" onClick={onEnableSound} className="btn btn-primary mt-3 w-full">
          <i className="fas fa-volume-high" aria-hidden="true" />
          {t('calls.turnOnSound')}
        </button>
      )}
      {phase === 'active' && audioHealth && !held && !remoteState.held && ((!audioHealth.incoming && !remoteState.muted) || (!audioHealth.outgoing && !muted)) && (
        <p role="alert" className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-left text-xs text-amber-900">
          {!audioHealth.incoming && !remoteState.muted && <span className="block">{t('calls.noSoundIn', { name })}</span>}
          {!audioHealth.outgoing && !muted && <span className="block">{t('calls.noSoundOut')}</span>}
        </p>
      )}
    </>
  );

  const controls = live && (
    <>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Control icon={muted ? 'fa-microphone' : 'fa-microphone-slash'} label={muted ? t('calls.unmute') : t('calls.mute')} pressed={Boolean(muted)} onClick={onToggleMute} />
        {routes ? (
          <Control
            icon={onSpeaker ? 'fa-phone' : 'fa-volume-high'}
            label={onSpeaker ? t('calls.useEarpiece') : t('calls.useSpeaker')}
            pressed={Boolean(onSpeaker)}
            onClick={() => onSetOutput(onSpeaker ? routes.earpiece.deviceId : routes.speaker.deviceId)}
          />
        ) : (
          <Control icon="fa-sliders" label={t('calls.audio')} expanded={settingsOpen} onClick={() => setSettingsOpen((v) => !v)} />
        )}
        <Control icon={held ? 'fa-play' : 'fa-pause'} label={held ? t('calls.resume') : t('calls.hold')} pressed={Boolean(held)} onClick={onToggleHold} disabled={phase !== 'active'} />
        {routes && <Control icon="fa-sliders" label={t('calls.audio')} expanded={settingsOpen} onClick={() => setSettingsOpen((v) => !v)} />}
        <Control
          icon="fa-comment"
          label={t('calls.openChat')}
          onClick={() => {
            if (phone) setMinimised(true); // the chat needs the screen
            onOpenChat();
          }}
        />
      </div>
      {settingsOpen && <AudioSettings audio={audio} onSetInput={onSetInput} onSetOutput={onSetOutput} onChooseOutput={onChooseOutput} onSetVolume={onSetVolume} />}
    </>
  );

  // Phone: the call fills the screen (person in the middle, controls at the bottom)
  if (fullScreen) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('calls.callWith', { name })}
        className="fixed inset-0 z-[95] flex flex-col overflow-y-auto bg-white px-5 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))] print:hidden"
      >
        <div className="flex">
          <button type="button" onClick={() => setMinimised(true)} className="btn btn-secondary btn-sm">
            <i className="fas fa-down-left-and-up-right-to-center" aria-hidden="true" />
            {t('calls.minimiseShort')}
          </button>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
          <Avatar name={name} size="2xl" />
          <h2 className="mt-4 text-2xl font-semibold wrap-anywhere text-slate-900">{name}</h2>
          <p className="mt-1 text-sm text-slate-600">{[tv('role', other?.role), other?.scope].filter(Boolean).join(' · ')}</p>
          <p className="mt-3 text-base font-medium text-bgb-700" aria-live="polite">
            {clock}
            {flags}
          </p>
          {phase === 'active' && quality && (
            <p className={cn('mt-1 text-sm', QUALITY_STYLE[quality])}>
              <i className="fas fa-signal mr-1" aria-hidden="true" />
              {t(`calls.quality.${quality}`)}
            </p>
          )}
          <div className="w-full">{notices}</div>
        </div>
        {controls}
        <div className="mt-6 flex justify-center">
          <RoundButton icon="fa-phone-slash" label={cancelOnly ? t('common.cancel') : t('calls.hangUp')} tone="end" onClick={onHangUp} />
        </div>
      </div>
    );
  }

  // Computer: a card at the bottom right
  return (
    <div
      role="status"
      aria-live="assertive"
      aria-label={t('calls.callWith', { name })}
      className="fixed right-5 bottom-5 z-[95] max-h-[calc(100dvh-2.5rem)] w-80 overflow-y-auto rounded-lg border border-slate-300 bg-white p-4 shadow-xl print:hidden"
    >
      <div className="flex items-center gap-3">
        <Avatar name={name} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{name}</p>
          <p className="truncate text-xs text-slate-500">{[tv('role', other?.role), other?.scope].filter(Boolean).join(' · ')}</p>
          <p className="mt-0.5 text-xs font-medium text-bgb-700">
            {clock}
            {flags}
          </p>
          {phase === 'active' && quality && (
            <p className={cn('mt-0.5 text-xs', QUALITY_STYLE[quality])}>
              <i className="fas fa-signal mr-1" aria-hidden="true" />
              {t(`calls.quality.${quality}`)}
            </p>
          )}
        </div>
        <button type="button" onClick={() => setMinimised(true)} className="btn btn-ghost btn-sm self-start" aria-label={t('calls.minimise')} title={t('calls.minimise')}>
          <i className="fas fa-down-left-and-up-right-to-center" aria-hidden="true" />
        </button>
      </div>
      {notices}
      {controls}
      <div className="mt-3 flex">{hangUpButton('flex-1')}</div>
    </div>
  );
}
