import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { lastActivityAt, markActivity } from '../utils/activity';

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'wheel'];
const CHECK_INTERVAL_MS = 15000;

/**
 * Spec #28 — ends the session after `policy.sessionTimeoutMinutes` (system_config
 * session.timeout_minutes) without user input. The server enforces the same limit on its side;
 * this hook makes an open, unattended tab sign out on time and tells the user why.
 */
export default function useIdleLogout() {
  const { currentUser, policy, logout } = useApp();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const timeoutMin = Number(policy.sessionTimeoutMinutes);

  useEffect(() => {
    if (!currentUser) return;
    const limitMs = timeoutMin * 60000;
    if (!(limitMs > 0)) return;

    markActivity();
    let lastMark = 0;
    const touch = () => {
      const now = Date.now();
      if (now - lastMark < 1000) return; // mousemove fires constantly
      lastMark = now;
      markActivity();
    };

    const check = () => {
      if (Date.now() - lastActivityAt() < limitMs) return;
      clearInterval(timer);
      logout('timeout');
      showToast(`Session expired after ${timeoutMin} minutes of inactivity`, 'warning');
      navigate('/login', { replace: true });
    };

    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const timer = setInterval(check, CHECK_INTERVAL_MS);
    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, touch));
      clearInterval(timer);
    };
  }, [currentUser, timeoutMin, logout, showToast, navigate]);
}
