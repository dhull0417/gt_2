// Saving an end date on a series that already has meetups after it: ask whether to delete
// them or keep them. Spec: docs/specs/2026-11-20-schedule-end-date-design.md
import { Alert } from 'react-native';
import { endDateShort } from './formSummaries';

export type EndDateAnswer = 'cancel' | 'keep' | 'delete';

/** The Delete / Keep / Cancel dialog. No count is shown: a series can have 100+ meetups. */
export const askDeleteAfterEnd = (endDate: string): Promise<EndDateAnswer> =>
  new Promise(resolve => {
    Alert.alert(
      `Delete meetups after ${endDateShort(endDate)}?`,
      'Some meetups are already on the calendar after this date. Delete them, or keep them?',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve('cancel') },
        { text: 'Keep', onPress: () => resolve('keep') },
        { text: 'Delete', style: 'destructive', onPress: () => resolve('delete') },
      ],
      { cancelable: true, onDismiss: () => resolve('cancel') },
    );
  });

/**
 * What to send as `removeAfterEnd`, or 'cancel' to abort the save. Only asks when an existing
 * schedule gets a new end date and the server has meetups after it; if that check fails the
 * save goes ahead and keeps them, so nothing is ever deleted by accident.
 */
export const decideRemoveAfterEnd = async ({ isNew, previous, next, countAfter, ask }: {
  isNew: boolean;
  previous: string | null;
  next: string | null;
  countAfter: (endDate: string) => Promise<number>;
  ask: (endDate: string) => Promise<EndDateAnswer>;
}): Promise<boolean | 'cancel'> => {
  if (isNew || !next || next === previous) return false;
  let count = 0;
  try {
    count = await countAfter(next);
  } catch {
    return false;
  }
  if (count === 0) return false;
  const answer = await ask(next);
  return answer === 'cancel' ? 'cancel' : answer === 'delete';
};
