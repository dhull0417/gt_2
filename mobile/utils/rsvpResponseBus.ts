type RsvpResponseListener = (status: 'in' | 'out') => void;

const listeners = new Set<RsvpResponseListener>();

export const emitRsvpResponse = (status: 'in' | 'out') => {
  listeners.forEach(listener => listener(status));
};

export const subscribeRsvpResponse = (listener: RsvpResponseListener): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
