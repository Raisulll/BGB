// Audio calls (spec #58 extension): ICE servers and the call log. Signalling uses the realtime
// channel (api/realtime.js); audio flows browser to browser and is never stored.
import { api } from './client';

export const ice = () => api('/calls/ice');
export const mine = (query, signal) => api('/calls', { query, signal });
/** Every call in the system: roles with the admin or audit page. */
export const all = (query, signal) => api('/calls/all', { query, signal });
