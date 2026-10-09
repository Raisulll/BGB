import { useEffect, useState } from 'react';
import * as messagingApi from '../../api/messaging';
import { errorMessage } from '../../api/client';
import { useI18n } from '../../i18n/I18nContext';
import { cn } from '../../utils/helpers';
import { formatDuration } from './CallPanel';

/**
 * A voice message. The audio is fetched with the access token only when the user plays it
 * (the server checks its SHA-256 before serving), then shown with the browser's own player.
 */
export default function VoiceMessage({ voice, mine = false }) {
  const { t } = useI18n();
  const [src, setSrc] = useState(null);
  const [state, setState] = useState('idle'); // idle | loading | error
  const [error, setError] = useState('');

  useEffect(() => () => src && URL.revokeObjectURL(src), [src]);

  const load = async () => {
    setState('loading');
    try {
      const { blob } = await messagingApi.voiceBlob(voice.url);
      setSrc(URL.createObjectURL(blob));
      setState('idle');
    } catch (err) {
      setError(errorMessage(err));
      setState('error');
    }
  };

  if (src) return <audio src={src} controls autoPlay className="h-10 w-64 max-w-full" aria-label={t('msg.voiceMessage')} />;

  return (
    <div>
      <button
        type="button"
        onClick={load}
        disabled={state === 'loading'}
        className={cn(
          'inline-flex min-h-9 items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium',
          mine ? 'border-white/40 text-white hover:bg-white/10' : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50',
        )}
      >
        <i className={`fas ${state === 'loading' ? 'fa-spinner fa-spin' : 'fa-play'} text-xs`} aria-hidden="true" />
        {t('msg.playVoice')}
        <span className="font-mono tabular-nums opacity-80">{formatDuration(voice.durationMs / 1000)}</span>
      </button>
      {state === 'error' && <p className={cn('mt-1 text-xs', mine ? 'text-white' : 'text-red-700')}>{error}</p>}
    </div>
  );
}
