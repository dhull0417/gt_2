/**
 * Android back inside a RN <Modal> goes to that Modal's onRequestClose, not to BackHandler.
 * In-tree overlays drawn inside a Modal (e.g. the cancel-reason box in the meetup sheet)
 * register here, and the Modal's onRequestClose calls runBackInterceptor() first so back
 * closes the overlay instead of the whole sheet.
 */
type Interceptor = { fn: () => void };

const stack: Interceptor[] = [];

/** Registers a handler; returns a function that unregisters it (safe to call twice). */
export function pushBackInterceptor(fn: () => void): () => void {
  const entry: Interceptor = { fn };
  stack.push(entry);
  return () => {
    const i = stack.indexOf(entry);
    if (i !== -1) stack.splice(i, 1);
  };
}

/** Runs the newest registered handler. Returns true if one ran (back was consumed). */
export function runBackInterceptor(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.fn();
  return true;
}
