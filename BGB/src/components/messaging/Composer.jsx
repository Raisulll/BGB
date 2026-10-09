import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/I18nContext';
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

/**
 * Message box: text (Enter sends, Shift+Enter adds a line) and voice recording
 * (record -> stop -> listen -> send or discard). Messages are permanent, so a recording is
 * always reviewed before it is sent.
 */
export default function Composer({ onSendText, onSendVoice, disabled }) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [rec, setRec] = useState(null); // { phase: 'recording' | 'review', startedAt, blob, url, durationMs }
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');
  const recorderRef = useRef(null);
  const discardRef = useRef(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (rec?.phase !== 'recording') return;
    const id = setInterval(() => {
      setNow(Date.now());
      if (Date.now() - rec.startedAt >= MAX_RECORD_MS) recorderRef.current?.stop();
    }, 250);
    return () => clearInterval(id);
  }, [rec]);

  // Leaving the conversation stops the microphone and drops an unsent recording
  useEffect(
    () => () => {
      discardRef.current = true;
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    },
    [],
  );
  useEffect(() => () => rec?.url && URL.revokeObjectURL(rec.url), [rec?.url]);

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
    discardRef.current = false;
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      recorderRef.current = null;
      const durationMs = Math.min(Date.now() - startedAt, MAX_RECORD_MS);
      if (discardRef.current) return setRec(null);
      if (durationMs < MIN_RECORD_MS) {
        setRec(null);
        return setError(t('msg.tooShort'));
      }
      const blob = new Blob(chunks, { type: (recorder.mimeType || type || 'audio/webm').split(';')[0] });
      setRec({ phase: 'review', blob, url: URL.createObjectURL(blob), durationMs });
    };
    recorderRef.current = recorder;
    recorder.start(250);
    setNow(startedAt);
    setRec({ phase: 'recording', startedAt });
  };

  const stopRecording = () => recorderRef.current?.stop();
  const discard = () => {
    discardRef.current = true;
    if (recorderRef.current) recorderRef.current.stop();
    else setRec(null);
  };

  const sendVoice = async () => {
    setSending(true);
    setError('');
    try {
      await onSendVoice(rec.blob, rec.durationMs);
      setRec(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="border-t border-slate-200 bg-white p-3">
      {error && (
        <p role="alert" className="mb-2 text-xs text-red-700">
          {error}
        </p>
      )}

      {rec?.phase === 'recording' ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex flex-1 items-center gap-2 text-sm text-slate-800" aria-live="polite">
            <span className="h-2.5 w-2.5 rounded-full bg-red-600" aria-hidden="true" />
            {t('msg.recording')}
            <span className="font-mono tabular-nums">{formatDuration((now - rec.startedAt) / 1000)}</span>
            <span className="text-xs text-slate-500">/ {formatDuration(MAX_RECORD_MS / 1000)}</span>
          </span>
          <button type="button" onClick={discard} className="btn btn-secondary btn-sm">
            {t('msg.discard')}
          </button>
          <button type="button" onClick={stopRecording} className="btn btn-primary btn-sm">
            <i className="fas fa-stop" aria-hidden="true" />
            {t('msg.stop')}
          </button>
        </div>
      ) : rec?.phase === 'review' ? (
        <div className="flex flex-wrap items-center gap-2">
          <audio src={rec.url} controls className="h-10 min-w-0 flex-1" aria-label={t('msg.reviewRecording')} />
          <button type="button" onClick={discard} disabled={sending} className="btn btn-secondary btn-sm">
            {t('msg.discard')}
          </button>
          <button type="button" onClick={sendVoice} disabled={sending || disabled} className="btn btn-primary btn-sm">
            <i className={`fas ${sending ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`} aria-hidden="true" />
            {t('msg.sendVoice')}
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-2">
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
            className="form-input max-h-40 min-h-11 flex-1 resize-none md:min-h-10"
          />
          <button type="button" onClick={startRecording} disabled={disabled || sending} className="btn btn-secondary" title={t('msg.recordHint')}>
            <i className="fas fa-microphone" aria-hidden="true" />
            <span className="hidden sm:inline">{t('msg.record')}</span>
            <span className="sr-only sm:hidden">{t('msg.record')}</span>
          </button>
          <button type="button" onClick={sendText} disabled={disabled || sending || !text.trim()} className="btn btn-primary">
            <i className={`fas ${sending ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`} aria-hidden="true" />
            <span className="hidden sm:inline">{t('msg.send')}</span>
            <span className="sr-only sm:hidden">{t('msg.send')}</span>
          </button>
        </div>
      )}
    </div>
  );
}
