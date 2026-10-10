import { useEffect, useRef, useState } from 'react';
import * as messagingApi from '../../api/messaging';
import { errorMessage } from '../../api/client';
import { useI18n } from '../../i18n/I18nContext';
import { cn } from '../../utils/helpers';
import { formatDuration } from './CallPanel';

/**
 * A voice message: play/pause, progress and time. The audio is fetched with the access token
 * the first time it is played (the server checks its SHA-256 before serving it).
 */
export default function VoiceMessage({ voice, mine = false }) {
  const { t } = useI18n();
  const audioRef = useRef(null);
  const [src, setSrc] = useState(null);
  const [state, setState] = useState('idle'); // idle | loading | playing | paused | error
  const [error, setError] = useState('');
  const [position, setPosition] = useState(0); // seconds
  const total = voice.durationMs / 1000;

  useEffect(() => () => src && URL.revokeObjectURL(src), [src]);

  const toggle = async () => {
    const audio = audioRef.current;
    if (state === 'playing') return audio.pause();
    if (src) return audio.play().catch(() => {});
    setState('loading');
    try {
      const { blob } = await messagingApi.voiceBlob(voice.url);
      setSrc(URL.createObjectURL(blob)); // plays on canplay below
    } catch (err) {
      setError(errorMessage(err));
      setState('error');
    }
  };

  const seek = (e) => {
    const audio = audioRef.current;
    if (!src || !audio) return;
    const box = e.currentTarget.getBoundingClientRect();
    audio.currentTime = Math.max(0, Math.min(1, (e.clientX - box.left) / box.width)) * total;
  };

  const progress = total ? Math.min(100, (position / total) * 100) : 0;

  return (
    <div className="flex w-56 max-w-full items-center gap-2.5 py-0.5">
      <button
        type="button"
        onClick={toggle}
        disabled={state === 'loading'}
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
          mine ? 'bg-white text-bgb-800 hover:bg-white/90' : 'bg-bgb-700 text-white hover:bg-bgb-800',
        )}
        aria-label={`${state === 'playing' ? t('msg.pauseVoice') : t('msg.playVoice')}: ${t('msg.voiceMessage')} ${formatDuration(total)}`}
      >
        <i className={`fas ${state === 'loading' ? 'fa-spinner fa-spin' : state === 'playing' ? 'fa-pause' : 'fa-play'} text-xs`} aria-hidden="true" />
      </button>
      <div className="min-w-0 flex-1">
        <div onClick={seek} className={cn('relative h-1.5 cursor-pointer rounded-full', mine ? 'bg-white/35' : 'bg-slate-300')} aria-hidden="true">
          <div className={cn('absolute inset-y-0 left-0 rounded-full', mine ? 'bg-white' : 'bg-bgb-700')} style={{ width: `${progress}%` }} />
        </div>
        {state === 'error' && <p className={cn('mt-1 text-xs', mine ? 'text-white' : 'text-red-700')}>{error}</p>}
      </div>
      <span className={cn('shrink-0 font-mono text-xs tabular-nums', mine ? 'text-white/90' : 'text-slate-600')}>
        {formatDuration(state === 'playing' || state === 'paused' ? position : total)}
      </span>
      {src && (
        <audio
          ref={audioRef}
          src={src}
          onCanPlay={() => state === 'loading' && audioRef.current.play().catch(() => setState('paused'))}
          onPlay={() => setState('playing')}
          onPause={() => setState('paused')}
          onEnded={() => {
            setState('idle');
            setPosition(0);
          }}
          onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
          className="hidden"
        />
      )}
    </div>
  );
}
