import { useEffect, useRef } from 'react';
import { pushBackInterceptor } from '@/utils/backInterceptors';

/** While `enabled`, Android back inside the surrounding Modal runs `handler` instead of closing it. */
export function useBackInterceptor(enabled: boolean, handler: () => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    return pushBackInterceptor(() => ref.current());
  }, [enabled]);
}
