import { useEffect, useRef } from 'react';
import { onlineManager, useIsRestoring, useQueryClient } from '@tanstack/react-query';
import { resumeQueued } from '@/utils/queuedMutations';

/**
 * Sends queued offline work (messages, RSVPs, votes, ...) once it is safe to: the saved cache has
 * been loaded back from disk AND sign-in is ready, so the requests carry a token. Resuming any
 * earlier (as the persister's onSuccess used to) sent restored RSVPs without a token on a cold
 * start; the server refused them and they were silently lost. Also re-sends on every reconnect.
 * (React Query also resumes paused work by itself on reconnect, before sign-in may be ready;
 * those attempts fail with NoTokenError and are retried - see queuedRetry.)
 */
export function useResumeQueuedMutations(ready: boolean) {
  const queryClient = useQueryClient();
  const isRestoring = useIsRestoring();
  const canResume = ready && !isRestoring;

  // The first resume after loading from disk also restarts work an app kill interrupted; later
  // ones must not (that same "pending" state then means a request running right now).
  const restoredHandled = useRef(false);
  useEffect(() => {
    if (!canResume) return;
    const resume = () => {
      const afterRestore = !restoredHandled.current;
      restoredHandled.current = true;
      resumeQueued(queryClient, { afterRestore });
    };
    if (onlineManager.isOnline()) resume();
    return onlineManager.subscribe((online) => {
      if (online) resume();
    });
  }, [canResume, queryClient]);
}
