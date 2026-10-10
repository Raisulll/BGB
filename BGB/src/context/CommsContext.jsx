import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as callsApi from '../api/calls';
import * as messagingApi from '../api/messaging';
import { connectRealtime, disconnectRealtime, onRealtime, onRealtimeStatus, realtimeReady, sendRealtime } from '../api/realtime';
import { useApp } from './AppContext';
import { useToast } from './ToastContext';
import { useI18n } from '../i18n/I18nContext';
import { startTone } from '../utils/tones';
import CallPanel from '../components/messaging/CallPanel';

// Messaging and audio calls (spec #58 extension). Owns what has to outlive a page: the realtime
// channel, the unread-message count for the sidebar, and the one live call (1:1 WebRTC audio).
// The server records every call and audits it; this context only drives the browser side.
//
// Call flow (signalling over the realtime channel, media browser to browser):
//   caller: getUserMedia -> call.invite -> call.ringing ... call.accepted -> offer
//   callee: call.incoming -> getUserMedia -> call.accept -> answer
//   both:   ICE candidates via call.signal; call.ended from the server closes everything.
// A dropped realtime connection doesn't end the call: after reconnecting the browser sends
// call.resume and the server keeps the call (CALL_RECONNECT_SECONDS). If the audio path itself
// fails, the caller restarts ICE once before the call is given up.

const CommsContext = createContext(null);
const UNREAD_POLL_MS = 60_000;
const ICE_RESTART_WAIT_MS = 15_000; // how long the callee waits for the caller's ICE restart

export function CommsProvider({ children }) {
  const { currentUser, hasPermission } = useApp();
  const { showToast } = useToast();
  const { t } = useI18n();
  const enabled = Boolean(currentUser) && !currentUser.mustChangePassword && hasPermission(currentUser, 'messages');
  const myId = currentUser?.id;

  const [connected, setConnected] = useState(realtimeReady());
  const [unread, setUnread] = useState(0);
  const [call, setCall] = useState(null); // { id?, phase, other, answeredAt?, muted }

  const callRef = useRef(null);
  const pcRef = useRef(null);
  const streamRef = useRef(null);
  const queueRef = useRef([]); // signals that arrived before the peer connection was ready
  const toneRef = useRef(null);
  const abandonedRef = useRef(false); // hung up before the server confirmed the invite
  const audioRef = useRef(null);
  const iceRef = useRef({ restarted: false, timer: null }); // ICE restart after a failed audio path

  const updateCall = useCallback((next) => {
    callRef.current = typeof next === 'function' ? next(callRef.current) : next;
    setCall(callRef.current);
  }, []);

  // ---------- Realtime channel ----------
  useEffect(() => {
    if (!enabled) return;
    const off = onRealtimeStatus(setConnected);
    connectRealtime();
    return () => {
      off();
      disconnectRealtime();
    };
  }, [enabled]);

  // ---------- Unread count (sidebar) ----------
  const refreshUnread = useCallback(async ({ background = true } = {}) => {
    try {
      const r = await messagingApi.unread({ background });
      setUnread(r.unread);
    } catch {}
  }, []);

  useEffect(() => {
    if (!enabled) {
      setUnread(0);
      return;
    }
    refreshUnread();
    const timer = setInterval(refreshUnread, UNREAD_POLL_MS);
    const off = onRealtime((msg) => {
      if (msg.type === 'message' && msg.message?.sender?.id !== myId) refreshUnread();
      else if (msg.type === 'read' || msg.type === 'conversation') refreshUnread();
    });
    return () => {
      clearInterval(timer);
      off();
    };
  }, [enabled, myId, refreshUnread]);

  // ---------- Calls ----------
  const stopTone = () => {
    toneRef.current?.();
    toneRef.current = null;
  };

  const cleanup = useCallback(() => {
    stopTone();
    clearTimeout(iceRef.current.timer);
    iceRef.current = { restarted: false, timer: null };
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
    }
    pcRef.current = null;
    queueRef.current = [];
    if (audioRef.current) audioRef.current.srcObject = null;
    updateCall(null);
  }, [updateCall]);

  const getMic = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error(t('calls.noMicSupport'));
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
    } catch {
      throw new Error(t('calls.micDenied'));
    }
  }, [t]);

  const applySignal = useCallback(async (pc, callId, data) => {
    if (data.sdp) {
      await pc.setRemoteDescription(data.sdp);
      if (data.sdp.type === 'offer') {
        await pc.setLocalDescription(await pc.createAnswer());
        sendRealtime({ type: 'call.signal', callId, data: { sdp: pc.localDescription.toJSON() } });
      }
      // Candidates that came before the description can be applied now
      const pending = queueRef.current.filter((d) => d.candidate);
      queueRef.current = [];
      for (const d of pending) await pc.addIceCandidate(d.candidate).catch(() => {});
    } else if (data.candidate) {
      if (pc.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => {});
      else queueRef.current.push(data);
    }
  }, []);

  const createPeer = useCallback(
    async (callId) => {
      const { iceServers } = await callsApi.ice();
      const pc = new RTCPeerConnection({ iceServers });
      pcRef.current = pc;
      streamRef.current.getTracks().forEach((track) => pc.addTrack(track, streamRef.current));
      pc.onicecandidate = (e) => {
        if (e.candidate) sendRealtime({ type: 'call.signal', callId, data: { candidate: e.candidate.toJSON() } });
      };
      pc.ontrack = (e) => {
        if (audioRef.current) {
          audioRef.current.srcObject = e.streams[0];
          audioRef.current.play?.().catch(() => {});
        }
      };
      const giveUp = () => {
        sendRealtime({ type: 'call.end', callId });
        showToast(t('calls.connectionFailed'), 'error');
        cleanup();
      };
      pc.onconnectionstatechange = async () => {
        // "disconnected" is often momentary (network change); WebRTC recovers by itself
        if (pc.connectionState === 'connected') {
          clearTimeout(iceRef.current.timer);
          iceRef.current.timer = null;
          updateCall((c) => (c && !c.answeredAt ? { ...c, phase: 'active', answeredAt: Date.now() } : c));
        } else if (pc.connectionState === 'failed') {
          if (iceRef.current.restarted || iceRef.current.timer) return giveUp();
          if (callRef.current?.role === 'caller') {
            // Only the caller renegotiates, so the two sides never send offers at the same time
            iceRef.current.restarted = true;
            try {
              await pc.setLocalDescription(await pc.createOffer({ iceRestart: true }));
              sendRealtime({ type: 'call.signal', callId, data: { sdp: pc.localDescription.toJSON() } });
            } catch {
              giveUp();
            }
          } else {
            iceRef.current.timer = setTimeout(giveUp, ICE_RESTART_WAIT_MS);
          }
        }
      };
      // Anything that arrived while the connection was being set up
      const early = queueRef.current;
      queueRef.current = [];
      for (const d of early) await applySignal(pc, callId, d);
      return pc;
    },
    [applySignal, cleanup, showToast, t, updateCall],
  );

  const startCall = useCallback(
    async (person) => {
      if (callRef.current) return showToast(t('calls.alreadyInCall'), 'warning');
      if (!realtimeReady()) return showToast(t('msg.offline'), 'error');
      abandonedRef.current = false;
      updateCall({ phase: 'starting', role: 'caller', other: person, muted: false });
      try {
        streamRef.current = await getMic();
      } catch (err) {
        cleanup();
        return showToast(err.message, 'error');
      }
      if (!callRef.current) {
        // Hung up while the microphone prompt was open
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        return;
      }
      if (!sendRealtime({ type: 'call.invite', to: person.id })) {
        cleanup();
        showToast(t('msg.offline'), 'error');
      }
    },
    [cleanup, getMic, showToast, t, updateCall],
  );

  const acceptCall = useCallback(async () => {
    const c = callRef.current;
    if (!c || c.phase !== 'incoming') return;
    stopTone();
    updateCall({ ...c, phase: 'connecting' });
    try {
      streamRef.current = await getMic();
      await createPeer(c.id);
    } catch (err) {
      sendRealtime({ type: 'call.decline', callId: c.id });
      cleanup();
      return showToast(err.message || t('calls.connectionFailed'), 'error');
    }
    sendRealtime({ type: 'call.accept', callId: c.id });
  }, [cleanup, createPeer, getMic, showToast, t, updateCall]);

  const declineCall = useCallback(() => {
    const c = callRef.current;
    if (c?.id) sendRealtime({ type: 'call.decline', callId: c.id });
    cleanup();
  }, [cleanup]);

  const hangUp = useCallback(() => {
    const c = callRef.current;
    if (!c) return;
    if (c.phase === 'incoming') return declineCall();
    if (!c.id) abandonedRef.current = true; // invite sent, id not known yet
    else sendRealtime({ type: c.phase === 'outgoing' ? 'call.cancel' : 'call.end', callId: c.id });
    cleanup();
  }, [cleanup, declineCall]);

  const toggleMute = useCallback(() => {
    const c = callRef.current;
    if (!c || !streamRef.current) return;
    const muted = !c.muted;
    streamRef.current.getAudioTracks().forEach((track) => (track.enabled = !muted));
    updateCall({ ...c, muted });
  }, [updateCall]);

  // Server -> browser call events
  useEffect(() => {
    if (!enabled) return;
    const endMessage = (status, reason, c) => {
      const name = c?.other?.name || '';
      if (status === 'declined') return [t('calls.toast.declined', { name }), 'info'];
      if (status === 'missed') return c?.phase === 'incoming' ? [t('calls.toast.missedIncoming', { name }), 'warning'] : [t('calls.toast.noAnswer', { name }), 'info'];
      if (status === 'ended' && reason === 'connection lost') return [t('calls.toast.lost'), 'warning'];
      if (status === 'ended') return [t('calls.toast.ended'), 'info'];
      return null;
    };

    return onRealtime(async (msg) => {
      if (!msg.type?.startsWith('call.')) return;
      const c = callRef.current;
      switch (msg.type) {
        case 'call.ringing': {
          if (abandonedRef.current || !c || c.phase !== 'starting') {
            abandonedRef.current = false;
            sendRealtime({ type: 'call.cancel', callId: msg.call.id });
            return;
          }
          updateCall({ ...c, id: msg.call.id, phase: 'outgoing', other: msg.call.other });
          stopTone();
          toneRef.current = startTone('ringback');
          return;
        }
        case 'call.incoming': {
          if (c) return; // the server marks busy users; a second tab of a busy user just ignores it
          updateCall({ id: msg.call.id, phase: 'incoming', role: 'callee', other: msg.call.other, muted: false });
          toneRef.current = startTone('ring');
          return;
        }
        case 'call.accepted': {
          if (!c || c.id !== msg.callId) return;
          stopTone();
          updateCall({ ...c, phase: 'connecting' });
          try {
            const pc = await createPeer(c.id);
            await pc.setLocalDescription(await pc.createOffer());
            sendRealtime({ type: 'call.signal', callId: c.id, data: { sdp: pc.localDescription.toJSON() } });
          } catch {
            sendRealtime({ type: 'call.end', callId: c.id });
            showToast(t('calls.connectionFailed'), 'error');
            cleanup();
          }
          return;
        }
        case 'call.signal': {
          if (!c || c.id !== msg.callId) return;
          if (!pcRef.current) queueRef.current.push(msg.data);
          else await applySignal(pcRef.current, c.id, msg.data).catch(() => {});
          return;
        }
        case 'call.taken': {
          // Answered in another tab or on another device
          if (c?.id === msg.callId && c.phase === 'incoming') cleanup();
          return;
        }
        case 'call.ended': {
          if (!c || c.id !== msg.callId) return;
          const toast = endMessage(msg.status, msg.reason, c);
          cleanup();
          if (toast) showToast(...toast);
          return;
        }
        case 'call.busy': {
          if (!c || c.phase !== 'starting') return;
          const name = c.other?.name || '';
          cleanup();
          showToast(t('calls.toast.busy', { name }), 'warning');
          return;
        }
        case 'call.error': {
          if (!c || c.phase !== 'starting') return;
          cleanup();
          showToast(t(`calls.error.${msg.code}`), 'error');
          return;
        }
      }
    });
  }, [enabled, applySignal, cleanup, createPeer, showToast, t, updateCall]);

  // Realtime connection dropped and came back: reattach the live call to the new connection.
  // A drop before the server confirmed the invite loses the call (its reply went to the old socket).
  useEffect(() => {
    if (!enabled) return;
    return onRealtimeStatus((up) => {
      const c = callRef.current;
      if (!c) return;
      if (up && c.id) sendRealtime({ type: 'call.resume', callId: c.id });
      else if (!up && !c.id) {
        cleanup();
        showToast(t('msg.offline'), 'error');
      }
    });
  }, [enabled, cleanup, showToast, t]);

  // Closing or reloading the tab ends the call at once instead of after the reconnect wait
  useEffect(() => {
    const onPageHide = () => {
      const c = callRef.current;
      if (!c?.id) return;
      if (c.phase === 'incoming') sendRealtime({ type: 'call.decline', callId: c.id });
      else sendRealtime({ type: c.phase === 'outgoing' ? 'call.cancel' : 'call.end', callId: c.id });
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, []);

  // Signing out or losing the permission ends any live call in this tab
  useEffect(() => {
    if (!enabled && callRef.current) cleanup();
  }, [enabled, cleanup]);
  useEffect(() => cleanup, [cleanup]);

  const value = useMemo(
    () => ({ enabled, connected, unread, refreshUnread, call, startCall, acceptCall, declineCall, hangUp, toggleMute }),
    [enabled, connected, unread, refreshUnread, call, startCall, acceptCall, declineCall, hangUp, toggleMute],
  );

  return (
    <CommsContext.Provider value={value}>
      {children}
      <audio ref={audioRef} autoPlay className="hidden" />
      {call && <CallPanel call={call} onAccept={acceptCall} onDecline={declineCall} onHangUp={hangUp} onToggleMute={toggleMute} />}
    </CommsContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useComms = () => useContext(CommsContext);
