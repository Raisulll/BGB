import { onEvent } from '../../realtime/hub.js';

// Bus events -> the recipients' open sockets: the app then reloads /alerts/active (ids only on the wire)
export function registerAlertsRealtime() {
  onEvent((event, send) => {
    if (event.type !== 'alert') return;
    for (const userId of event.recipients) send(userId, { type: 'alert', alertId: event.alertId, event: event.event });
  });
}
