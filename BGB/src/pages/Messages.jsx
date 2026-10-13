import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import * as messagingApi from '../api/messaging';
import { errorMessage } from '../api/client';
import { onRealtime } from '../api/realtime';
import { useApp } from '../context/AppContext';
import { useComms } from '../context/CommsContext';
import { useToast } from '../context/ToastContext';
import useApi from '../hooks/useApi';
import { useI18n } from '../i18n/I18nContext';
import { cn, formatDateDisplay, formatDateTime } from '../utils/helpers';
import { closeNotifications } from '../utils/push';
import Avatar from '../components/messaging/Avatar';
import Composer from '../components/messaging/Composer';
import GroupDialog from '../components/messaging/GroupDialog';
import PeoplePicker from '../components/messaging/PeoplePicker';
import VoiceMessage from '../components/messaging/VoiceMessage';
import { formatDuration } from '../components/messaging/CallPanel';
import ErrorState from '../components/ui/ErrorState';
import Modal from '../components/ui/Modal';
import Spinner from '../components/ui/Spinner';

// Messaging (spec #58 extension): direct and group conversations between any BIRDS users, text
// and voice messages, live delivery over the realtime channel. Messages are permanent records:
// there is no edit or delete, and the server keeps them append-only.

const PAGE = 50;

/** "HH:MM" today, otherwise "DD-MM-YYYY" (BST). */
function shortTime(iso) {
  const full = formatDateTime(iso);
  return formatDateDisplay(iso) === formatDateDisplay(new Date().toISOString()) ? full.slice(11) : full.slice(0, 10);
}

/** How a call entry reads for this viewer: the label, and whether it is a call they missed. */
function callLabel(call, t, myId) {
  const mine = call.callerId === myId;
  const key = {
    ended: mine ? 'outgoing' : 'incoming',
    missed: mine ? 'noAnswer' : 'missed',
    cancelled: mine ? 'cancelled' : 'missed',
    declined: mine ? 'declinedByThem' : 'declinedByYou',
    failed: call.endReason === 'busy' ? (mine ? 'busy' : 'missedBusy') : 'failed',
  }[call.status] ?? 'failed';
  const duration = call.status === 'ended' ? ` · ${formatDuration(call.durationSeconds ?? 0)}` : '';
  return { text: `${t(`msg.call.${key}`)}${duration}`, missed: key === 'missed' || key === 'missedBusy' };
}

function preview(m, t, myId) {
  if (!m) return t('msg.noMessages');
  if (m.kind === 'call' && m.call) return callLabel(m.call, t, myId).text;
  const who = m.kind !== 'system' && m.sender?.id === myId ? `${t('msg.you')}: ` : '';
  if (m.kind === 'voice') return `${who}${t('msg.voiceMessage')} (${formatDuration(m.voice?.durationMs / 1000)})`;
  return `${who}${m.body}`;
}

// ---------------------------------------------------------------------------
// Conversation list
// ---------------------------------------------------------------------------
function ConversationList({ list, activeId, myId, onNewDirect, onNewGroup }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const shown = q.trim() ? list.filter((c) => c.title.toLowerCase().includes(q.trim().toLowerCase())) : list;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 p-3">
        <div className="flex gap-2">
          <button type="button" onClick={onNewDirect} className="btn btn-primary btn-sm flex-1">
            <i className="fas fa-pen" aria-hidden="true" />
            {t('msg.newMessage')}
          </button>
          <button type="button" onClick={onNewGroup} className="btn btn-secondary btn-sm flex-1">
            <i className="fas fa-users" aria-hidden="true" />
            {t('msg.newGroup')}
          </button>
        </div>
        <div className="relative">
          <i className="fas fa-magnifying-glass pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-xs text-slate-500" aria-hidden="true" />
          <label htmlFor="conv-filter" className="sr-only">
            {t('msg.filterConversations')}
          </label>
          <input
            id="conv-filter"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('msg.filterConversations')}
            className="h-10 w-full rounded-full border-0 bg-slate-100 pr-4 pl-9 text-sm text-slate-900 placeholder:text-slate-500 focus:bg-white focus:ring-2 focus:ring-bgb-600 focus:outline-none"
          />
        </div>
      </div>

      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2" aria-label={t('msg.conversations')}>
        {shown.length === 0 && <li className="p-6 text-center text-sm text-slate-500">{list.length ? t('msg.noMatch') : t('msg.noConversations')}</li>}
        {shown.map((c) => (
          <li key={c.id}>
            <Link
              to={`/messages/${c.id}`}
              aria-current={c.id === activeId ? 'page' : undefined}
              className={cn('flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-slate-100', c.id === activeId && 'bg-bgb-50 hover:bg-bgb-50')}
            >
              <Avatar name={c.title} group={c.kind === 'group'} photoUrl={c.coverUrl} size="lg" />
              <span className="min-w-0 flex-1">
                <span className={cn('block truncate text-sm text-slate-900', c.unread ? 'font-semibold' : 'font-medium')}>{c.title}</span>
                <span className={cn('flex min-w-0 items-center gap-1 text-xs', c.unread ? 'font-semibold text-slate-900' : 'text-slate-500')}>
                  <span className="truncate">{preview(c.lastMessage, t, myId)}</span>
                  <span className="shrink-0" aria-hidden="true">
                    ·
                  </span>
                  <span className="shrink-0">{shortTime(c.lastMessageAt)}</span>
                </span>
              </span>
              {c.unread > 0 && (
                <span
                  className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-bgb-700 px-1.5 text-[11px] font-semibold text-white"
                  aria-label={t('msg.unreadCount', { n: c.unread })}
                >
                  {c.unread}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Thread
// ---------------------------------------------------------------------------
// Consecutive messages from one sender within this gap form one run (one avatar, joined corners)
const RUN_GAP_MS = 5 * 60_000;
// A gap this long shows the time again between messages
const TIME_GAP_MS = 15 * 60_000;

/** A finished call between the two people, on the caller's side of the thread. */
function CallEntry({ m, mine, onCallBack, callDisabled }) {
  const { t } = useI18n();
  const myId = mine ? m.call.callerId : m.call.calleeId;
  const { text, missed } = callLabel(m.call, t, myId);
  const time = formatDateTime(m.createdAt, { withSeconds: true });
  return (
    <li className={cn('mt-3 flex', mine ? 'justify-end' : 'justify-start pl-9')}>
      <div title={time} className="flex items-center gap-3 rounded-[1.125rem] border border-slate-200 bg-white px-3 py-2">
        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', missed ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600')} aria-hidden="true">
          <i className={cn('fas', missed ? 'fa-phone-slash' : 'fa-phone')} />
        </span>
        <div className="min-w-0">
          <p className={cn('text-sm font-medium', missed ? 'text-red-700' : 'text-slate-900')}>{text}</p>
          <p className="text-xs text-slate-500">{formatDateTime(m.createdAt).slice(11)}</p>
        </div>
        {onCallBack && (
          <button type="button" onClick={onCallBack} disabled={callDisabled} className="btn btn-secondary btn-sm ml-1">
            <i className="fas fa-phone" aria-hidden="true" />
            {t('msg.call.callBack')}
          </button>
        )}
      </div>
    </li>
  );
}

function MessageBubble({ m, mine, first, last, showSender }) {
  const { t } = useI18n();
  if (m.kind === 'system') {
    return (
      <li className="my-3 text-center">
        <span className="text-xs text-slate-500">
          {m.body} · {formatDateTime(m.createdAt).slice(11)}
        </span>
      </li>
    );
  }
  const time = formatDateTime(m.createdAt, { withSeconds: true });
  return (
    <li className={cn('flex items-end gap-2', mine ? 'justify-end' : 'justify-start', first ? 'mt-3' : 'mt-0.5')}>
      {!mine && (last ? <Avatar name={m.sender.name} size="xs" className="mb-0.5" /> : <span className="w-7 shrink-0" aria-hidden="true" />)}
      <div className={cn('flex max-w-[78%] flex-col sm:max-w-[65%]', mine ? 'items-end' : 'items-start')}>
        {showSender && !mine && first && <p className="mb-0.5 px-3 text-xs text-slate-500">{m.sender.name}</p>}
        <div
          title={time}
          className={cn(
            'rounded-[1.125rem] px-3 py-2',
            mine ? 'bg-bgb-700 text-white' : 'bg-slate-100 text-slate-900',
            !first && (mine ? 'rounded-tr-md' : 'rounded-tl-md'),
            !last && (mine ? 'rounded-br-md' : 'rounded-bl-md'),
          )}
        >
          <span className="sr-only">
            {mine ? t('msg.you') : m.sender.name}, {time}:{' '}
          </span>
          {m.kind === 'voice' ? <VoiceMessage voice={m.voice} mine={mine} /> : <p className="whitespace-pre-wrap break-words text-sm leading-5">{m.body}</p>}
        </div>
      </div>
    </li>
  );
}

function Thread({ conversation, myId, onChanged, onBack }) {
  const { t, tv } = useI18n();
  const { showToast } = useToast();
  const { startCall, call, refreshUnread, connected } = useComms();
  const navigate = useNavigate();
  const id = conversation.id;
  const [messages, setMessages] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState('');
  const [membersOpen, setMembersOpen] = useState(false);
  const scrollRef = useRef(null);
  const stickToBottom = useRef(true);
  const lastRead = useRef(conversation.lastReadId);

  const other = conversation.kind === 'direct' ? conversation.members.find((m) => m.id !== myId) : null;

  const markRead = useCallback(
    async (list, background) => {
      const last = list?.at(-1);
      if (!last || last.id <= lastRead.current || document.visibilityState !== 'visible') return;
      lastRead.current = last.id;
      try {
        await messagingApi.markRead(id, last.id, { background });
        refreshUnread();
        onChanged(); // the list's unread count, even if the socket missed the event
      } catch {}
    },
    [id, refreshUnread, onChanged],
  );

  // First page
  useEffect(() => {
    const controller = new AbortController();
    setMessages(null);
    setError('');
    stickToBottom.current = true;
    messagingApi
      .history(id, { limit: PAGE }, controller.signal)
      .then((r) => {
        setMessages(r.messages);
        setHasMore(r.hasMore);
      })
      .catch((err) => !controller.signal.aborted && setError(errorMessage(err)));
    return () => controller.abort();
  }, [id]);

  // Whatever is on screen (first page, live arrivals) counts as read while the tab is visible
  useEffect(() => {
    markRead(messages, true);
    if (document.visibilityState === 'visible') closeNotifications(`conv-${id}`);
  }, [messages, markRead, id]);

  // Live messages for this conversation
  useEffect(
    () =>
      onRealtime((msg) => {
        if (msg.type !== 'message' || msg.message.conversationId !== id) return;
        setMessages((list) => (!list || list.some((m) => m.id === msg.message.id) ? list : [...list, msg.message]));
      }),
    [id],
  );

  // Adds whatever is newer than the last message on screen
  const catchUp = useCallback(() => {
    messagingApi
      .history(id, { limit: PAGE, background: true })
      .then((r) =>
        setMessages((list) => {
          if (!list) return list;
          const known = new Set(list.map((m) => m.id));
          const fresh = r.messages.filter((m) => !known.has(m.id) && m.id > (list.at(-1)?.id ?? 0));
          return fresh.length ? [...list, ...fresh] : list;
        }),
      )
      .catch(() => {});
  }, [id]);

  // After a reconnect, add anything that arrived while the channel was down
  const loaded = Boolean(messages);
  useEffect(() => {
    if (connected && loaded) catchUp();
  }, [connected, loaded, catchUp]);

  // Group events (rename, photo, members) arrive as a changed conversation, not as a message:
  // when its latest message is newer than the one on screen, load it
  const latestId = conversation.lastMessage?.id ?? 0;
  const shownId = messages?.at(-1)?.id ?? 0;
  useEffect(() => {
    if (loaded && latestId > shownId) catchUp();
  }, [latestId, shownId, loaded, catchUp]);

  // Coming back to the tab marks what arrived meanwhile as read
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && markRead(messages, false);
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [messages, markRead]);

  // Keep the newest message in view unless the user scrolled up to read history
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onScroll = () => {
    const el = scrollRef.current;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const loadOlder = async () => {
    if (!messages?.length) return;
    const el = scrollRef.current;
    const fromBottom = el.scrollHeight - el.scrollTop;
    setLoadingOlder(true);
    try {
      const r = await messagingApi.history(id, { before: messages[0].id, limit: PAGE });
      stickToBottom.current = false;
      setMessages((list) => [...r.messages, ...list]);
      setHasMore(r.hasMore);
      requestAnimationFrame(() => (el.scrollTop = el.scrollHeight - fromBottom));
    } catch (err) {
      showToast(errorMessage(err), 'error');
    } finally {
      setLoadingOlder(false);
    }
  };

  const append = (m) => {
    stickToBottom.current = true;
    lastRead.current = Math.max(lastRead.current, m.id);
    setMessages((list) => (list && !list.some((x) => x.id === m.id) ? [...list, m] : list));
    onChanged();
  };

  const sendText = async (body) => {
    try {
      append(await messagingApi.send(id, body));
    } catch (err) {
      throw new Error(errorMessage(err));
    }
  };
  const sendVoice = async (blob, durationMs) => {
    try {
      append(await messagingApi.sendVoice(id, blob, durationMs));
    } catch (err) {
      throw new Error(errorMessage(err));
    }
  };

  // Time separators (new day, or a long gap) and runs of messages from one sender
  const rows = useMemo(() => {
    const list = messages || [];
    const at = (m) => new Date(m.createdAt).getTime();
    const breaksBefore = (prev, m) => !prev || formatDateDisplay(prev.createdAt) !== formatDateDisplay(m.createdAt) || at(m) - at(prev) >= TIME_GAP_MS;
    const solo = (m) => m.kind === 'system' || m.kind === 'call';
    const sameRun = (a, b) => !solo(a) && !solo(b) && a.sender?.id === b.sender?.id && at(b) - at(a) < RUN_GAP_MS;
    const out = [];
    list.forEach((m, i) => {
      const prev = list[i - 1];
      const next = list[i + 1];
      const sep = breaksBefore(prev, m);
      if (sep) {
        const newDay = !prev || formatDateDisplay(prev.createdAt) !== formatDateDisplay(m.createdAt);
        const clock = formatDateTime(m.createdAt).slice(11);
        out.push({ sep: newDay ? `${formatDateDisplay(m.createdAt)} ${clock}` : clock, key: `s-${m.id}` });
      }
      out.push({
        m,
        key: m.id,
        first: sep || !sameRun(prev, m),
        last: !next || breaksBefore(m, next) || !sameRun(m, next),
      });
    });
    return out;
  }, [messages]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-slate-200 px-3 py-2.5">
        <button type="button" onClick={onBack} className="btn btn-secondary btn-sm md:hidden" aria-label={t('msg.backToList')}>
          <i className="fas fa-arrow-left" aria-hidden="true" />
        </button>
        <Avatar name={conversation.title} group={conversation.kind === 'group'} photoUrl={conversation.coverUrl} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-slate-900">{conversation.title}</h2>
          <p className="truncate text-xs text-slate-500">
            {other ? [tv('role', other.role), other.scope].join(' · ') : t('msg.memberCount', { n: conversation.members.length })}
          </p>
        </div>
        {other ? (
          <button type="button" onClick={() => startCall(other)} disabled={Boolean(call)} className="btn btn-secondary btn-sm">
            <i className="fas fa-phone" aria-hidden="true" />
            {t('calls.call')}
          </button>
        ) : (
          <button type="button" onClick={() => setMembersOpen(true)} className="btn btn-secondary btn-sm">
            <i className="fas fa-users" aria-hidden="true" />
            {t('msg.groupSettings')}
            {conversation.myRole === 'admin' && conversation.pendingRequests.length > 0 && (
              <span className="rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-900" aria-label={t('msg.requestsBadge', { n: conversation.pendingRequests.length })}>
                {conversation.pendingRequests.length}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto bg-white px-3 py-3">
        {error ? (
          <ErrorState message={error} />
        ) : !messages ? (
          <Spinner />
        ) : (
          <>
            {hasMore && (
              <div className="mb-3 text-center">
                <button type="button" onClick={loadOlder} disabled={loadingOlder} className="btn btn-secondary btn-sm">
                  {loadingOlder && <i className="fas fa-spinner fa-spin" aria-hidden="true" />}
                  {t('msg.loadEarlier')}
                </button>
              </div>
            )}
            {messages.length === 0 && <p className="mt-10 text-center text-sm text-slate-500">{t('msg.startHint')}</p>}
            <ol aria-label={t('msg.messagesIn', { name: conversation.title })} aria-live="polite">
              {rows.map((r) =>
                r.sep ? (
                  <li key={r.key} className="mt-4 mb-1 text-center text-xs font-medium text-slate-500" role="separator">
                    {r.sep}
                  </li>
                ) : r.m.kind === 'call' && r.m.call ? (
                  <CallEntry
                    key={r.key}
                    m={r.m}
                    mine={r.m.call.callerId === myId}
                    onCallBack={other ? () => startCall(other) : null}
                    callDisabled={Boolean(call)}
                  />
                ) : (
                  <MessageBubble key={r.key} m={r.m} first={r.first} last={r.last} mine={r.m.sender?.id === myId} showSender={conversation.kind === 'group'} />
                ),
              )}
            </ol>
          </>
        )}
      </div>

      <p className="bg-white px-4 pb-1 text-center text-[11px] text-slate-500">
        <i className="fas fa-lock mr-1" aria-hidden="true" />
        {t('msg.recordNotice')}
      </p>
      <Composer key={id} onSendText={sendText} onSendVoice={sendVoice} disabled={!messages} />

      {membersOpen && (
        <GroupDialog
          conversation={conversation}
          myId={myId}
          onClose={() => setMembersOpen(false)}
          onChanged={onChanged}
          onLeft={() => {
            setMembersOpen(false);
            onChanged();
            navigate('/messages');
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------
function NewDirectDialog({ onClose, onOpened }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const pick = async (person) => {
    setBusy(true);
    try {
      onOpened(await messagingApi.openDirect(person.id));
    } catch (err) {
      showToast(errorMessage(err), 'error');
      setBusy(false);
    }
  };
  return (
    <Modal open title={t('msg.newMessage')} icon="fa-pen" onClose={onClose} busy={busy}>
      <PeoplePicker onPick={pick} disabled={busy} />
    </Modal>
  );
}

function NewGroupDialog({ onClose, onOpened }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [title, setTitle] = useState('');
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const valid = title.trim().length >= 2 && selected.length > 0;

  const submit = async (e) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    try {
      onOpened(await messagingApi.createGroup(title.trim(), selected));
    } catch (err) {
      showToast(errorMessage(err), 'error');
      setBusy(false);
    }
  };

  return (
    <Modal open title={t('msg.newGroup')} icon="fa-users" onClose={onClose} busy={busy} maxWidth="max-w-lg">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="group-title" className="form-label">
            {t('msg.groupName')}
          </label>
          <input id="group-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} required className="form-input" placeholder={t('msg.groupNameHint')} />
        </div>
        <div>
          <p className="form-label">{t('msg.groupMembers', { n: selected.length })}</p>
          <PeoplePicker multiple selected={selected} onChange={setSelected} disabled={busy} />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="btn btn-secondary">
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={!valid || busy} className="btn btn-primary">
            {t('msg.createGroup')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function Messages() {
  const { t } = useI18n();
  const { currentUser } = useApp();
  const { connected } = useComms();
  // Only report a lost channel after a few seconds (not while it is first connecting)
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    if (connected) return setOffline(false);
    const id = setTimeout(() => setOffline(true), 4000);
    return () => clearTimeout(id);
  }, [connected]);
  const { id: idParam } = useParams();
  const navigate = useNavigate();
  const activeId = idParam ? Number(idParam) : null;
  const [dialog, setDialog] = useState(null); // 'direct' | 'group'
  const myId = currentUser.id;

  const { data: list, error, message, reload, setData } = useApi((signal) => messagingApi.conversations({ signal }), []);

  // Socket events change the list (new message, new group, membership, read on another device):
  // reload it in the background, coalescing bursts.
  const timer = useRef(null);
  const reloadQuietly = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      messagingApi
        .conversations({ background: true })
        .then(setData)
        .catch(() => {});
    }, 300);
  }, [setData]);
  // After a reconnect, catch up on whatever was pushed while the channel was down
  useEffect(() => {
    if (connected) reloadQuietly();
  }, [connected, reloadQuietly]);
  useEffect(() => {
    const off = onRealtime((msg) => ['message', 'conversation', 'read'].includes(msg.type) && reloadQuietly());
    return () => {
      off();
      clearTimeout(timer.current);
    };
  }, [reloadQuietly]);

  // The open conversation: from the list, or fetched (just created, or opened by link)
  const fromList = list?.find((c) => c.id === activeId);
  const { data: fetched, error: convError, message: convMessage } = useApi((signal) => messagingApi.conversation(activeId, signal), [activeId, Boolean(fromList)], {
    enabled: Boolean(activeId) && Boolean(list) && !fromList,
  });
  const active = fromList || (fetched?.id === activeId ? fetched : null);

  const opened = (c) => {
    setDialog(null);
    reloadQuietly();
    navigate(`/messages/${c.id}`);
  };

  if (error) return <ErrorState message={message} onRetry={reload} />;

  return (
    <div className="space-y-3">
      {offline && (
        <p role="status" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <i className="fas fa-plug mr-2" aria-hidden="true" />
          {t('msg.offlineBanner')}
        </p>
      )}
      <div className="card flex h-[calc(100dvh-10rem)] min-h-[28rem] overflow-hidden">
        <aside className={cn('w-full shrink-0 border-r border-slate-200 md:block md:w-80 lg:w-96', activeId ? 'hidden' : 'block')}>
          {!list ? <Spinner /> : <ConversationList list={list} activeId={activeId} myId={myId} onNewDirect={() => setDialog('direct')} onNewGroup={() => setDialog('group')} />}
        </aside>
        <section className={cn('min-w-0 flex-1', activeId ? 'block' : 'hidden md:block')}>
          {!activeId ? (
            <div className="flex h-full flex-col items-center justify-center p-6 text-center">
              <i className="fas fa-comments mb-3 text-3xl text-slate-300" aria-hidden="true" />
              <p className="text-sm font-medium text-slate-700">{t('msg.pickConversation')}</p>
              <p className="mt-1 max-w-sm text-xs text-slate-500">{t('msg.pickHint')}</p>
            </div>
          ) : convError ? (
            <ErrorState message={convMessage} />
          ) : !active ? (
            <Spinner />
          ) : (
            <Thread key={active.id} conversation={active} myId={myId} onChanged={reloadQuietly} onBack={() => navigate('/messages')} />
          )}
        </section>
      </div>

      {dialog === 'direct' && <NewDirectDialog onClose={() => setDialog(null)} onOpened={opened} />}
      {dialog === 'group' && <NewGroupDialog onClose={() => setDialog(null)} onOpened={opened} />}
    </div>
  );
}
