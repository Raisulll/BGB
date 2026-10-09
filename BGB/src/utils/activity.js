// Spec #28 — last time the user actually interacted with the page (mouse, keyboard, touch, scroll).
// useIdleLogout ends the session after the configured idle period; the notification poller uses
// it to mark polls as background so they don't keep the server-side session alive.
let lastActivity = Date.now();

export const markActivity = () => {
  lastActivity = Date.now();
};
export const lastActivityAt = () => lastActivity;
