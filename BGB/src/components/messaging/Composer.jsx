import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/I18nContext';
import { cn } from '../../utils/helpers';
import { formatDuration } from './CallPanel';

const MAX_RECORD_MS = 300_000; // the server accepts 0.3–300 s
const MIN_RECORD_MS = 300;
const MAX_TEXT = 4000;

/** First container/codec this browser can record; the server checks the bytes, not the name. */
function recorderType() {
  if (typeof MediaRecorder === 'undefined') return null;
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  return types.find((type) => MediaRecorder.isTypeSupported?.(type)) ?? '';
}

// Round icon buttons of the message bar (chat convention); each has an accessible name and tooltip
const ROUND = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full disabled:opacity-40';

/**
 * Message bar: text (Enter sends, Shift+Enter adds a line) and voice in one step: the microphone
 * starts recording, Send stops it and sends it, Cancel drops it.
 */
export default function Composer({ onSendText, onSendVoice, disabled }) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [rec, setRec] = useState(null); // { startedAt, sending? }
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');
  const recorderRef = useRef(null);
  const sendOnStopRef = useRef(false); // false: the recording is dropped when it stops
  const inputRef = useRef(null);

  useEffect(() => {
    if (!rec || rec.sending) return;
    const id = setInterval(() => {
      setNow(Date.now());
      // At the limit the recording is sent as it is
      if (Date.now() - rec.startedAt >= MAX_RECORD_MS) finishRecording(true);
    }, 250);
    return () => clearInterval(id);
  }, [rec]);

  // Leaving the conversation stops the microphone and drops an unsent recording
  useEffect(
    () => () => {
      sendOnStopRef.current = false;
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    },
    [],
  );

  // Grow the text box with its content, up to its max height
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text, rec]);

  const sendText = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError('');
    try {
      await onSendText(body);
      setText('');
      inputRef.current?.focus();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const startRecording = async () => {
    setError('');
    const type = recorderType();
    if (type === null || !navigator.mediaDevices?.getUserMedia) return setError(t('msg.noRecording'));
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      return setError(t('calls.micDenied'));
    }
    const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks = [];
    const startedAt = Date.now();
    sendOnStopRef.current = false;
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      recorderRef.current = null;
      const durationMs = Math.min(Date.now() - startedAt, MAX_RECORD_MS);
      if (!sendOnStopRef.current) return setRec(null);
      if (durationMs < MIN_RECORD_MS) {
        setRec(null);
        return setError(t('msg.tooShort'));
      }
      const blob = new Blob(chunks, { type: (recorder.mimeType || type || 'audio/webm').split(';')[0] });
      setRec({ startedAt, sending: true });
      try {
        await onSendVoice(blob, durationMs);
      } catch (err) {
        setError(err.message);
      } finally {
        setRec(null);
      }
    };
    recorderRef.current = recorder;
    recorder.start(250);
    setNow(startedAt);
    setRec({ startedAt });
  };

  function finishRecording(send) {
    sendOnStopRef.current = send;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    else if (!send) setRec(null);
  }

  const hasText = Boolean(text.trim());

  return (
    <div className="border-t border-slate-200 bg-white px-2 py-2 sm:px-3">
      {error && (
        <p role="alert" className="mb-2 px-2 text-xs text-red-700">
          {error}
        </p>
      )}

      {rec ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => finishRecording(false)}
            disabled={rec.sending}
            className={cn(ROUND, 'text-red-700 hover:bg-red-50')}
            aria-label={t('msg.cancelRecording')}
            title={t('msg.cancelRecording')}
          >
            <i className="fas fa-trash-can" aria-hidden="true" />
          </button>
          <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full bg-bgb-700 px-4 text-sm text-white" aria-live="polite">
            <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', rec.sending ? 'bg-white/60' : 'bg-red-400')} aria-hidden="true" />
            <span className="truncate">{rec.sending ? t('msg.sendingVoice') : t('msg.recording')}</span>
            <span className="ml-auto font-mono tabular-nums">{formatDuration((now - rec.startedAt) / 1000)}</span>
          </div>
          <button
            type="button"
            onClick={() => finishRecording(true)}
            disabled={rec.sending || disabled}
            className={cn(ROUND, 'bg-bgb-700 text-white hover:bg-bgb-800')}
            aria-label={t('msg.sendVoice')}
            title={t('msg.sendVoice')}
          >
            <i className={`fas ${rec.sending ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-1.5">
          <button
            type="button"
            onClick={startRecording}
            disabled={disabled || sending}
            className={cn(ROUND, 'text-bgb-700 hover:bg-bgb-50')}
            aria-label={t('msg.record')}
            title={t('msg.recordHint')}
          >
            <i className="fas fa-microphone text-lg" aria-hidden="true" />
          </button>
          <label htmlFor="msg-input" className="sr-only">
            {t('msg.typeMessage')}
          </label>
          <textarea
            id="msg-input"
            ref={inputRef}
            rows={1}
            value={text}
            maxLength={MAX_TEXT}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                sendText();
              }
            }}
            placeholder={t('msg.typeMessage')}
            disabled={disabled}
            className="max-h-32 min-h-10 min-w-0 flex-1 resize-none rounded-[1.25rem] border-0 bg-slate-100 px-4 py-2.5 text-sm leading-5 text-slate-900 placeholder:text-slate-500 focus:bg-white focus:ring-2 focus:ring-bgb-600 focus:outline-none"
          />
          <button
            type="button"
            onClick={sendText}
            disabled={disabled || sending || !hasText}
            className={cn(ROUND, 'text-bgb-700 hover:bg-bgb-50')}
            aria-label={t('msg.send')}
            title={t('msg.send')}
          >
            <i className={`fas ${sending ? 'fa-spinner fa-spin' : 'fa-paper-plane'} text-lg`} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
