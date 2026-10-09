import { onEvent } from '../../realtime/hub.js';
import { messageDto } from './messaging.service.js';

// Bus events -> pushes to the members' open sockets (this process's share of them)
export function registerMessagingRealtime() {
  onEvent(async (event, send) => {
    if (event.type === 'message.new') {
      const message = await messageDto(event.messageId);
      if (!message) return;
      for (const userId of event.recipients) send(userId, { type: 'message', message });
    } else if (event.type === 'conversation.changed') {
      for (const userId of event.recipients) send(userId, { type: 'conversation', conversationId: event.conversationId });
    } else if (event.type === 'read') {
      // Keeps the user's other tabs/devices in step
      send(event.userId, { type: 'read', conversationId: event.conversationId });
    }
  });
}
