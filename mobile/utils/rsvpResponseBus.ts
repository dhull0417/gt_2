import type { RsvpResponse } from '@/utils/rsvpResponses';

/** `custom` = the group's own reactions for this status; when non-empty only those play. */
type RsvpResponseListener = (status: 'in' | 'out', custom?: RsvpResponse[]) => void;

const listeners = new Set<RsvpResponseListener>();

export const emitRsvpResponse = (status: 'in' | 'out', custom?: RsvpResponse[]) => {
  listeners.forEach(listener => listener(status, custom));
};

export const subscribeRsvpResponse = (listener: RsvpResponseListener): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
