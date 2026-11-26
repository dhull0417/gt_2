// Without the native module (Expo Go, or an older binary that got this as an OTA update),
// sharing falls back to React Native's plain text share.
import { Share } from 'react-native';

jest.mock('expo', () => ({ requireOptionalNativeModule: () => null }));

import { shareWithPreview } from '../index';

it('falls back to the plain text share with only the message', async () => {
  const spy = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction } as any);
  await expect(shareWithPreview({ message: 'MSG', title: 'Join Hikers on GroupThat', imageUri: 'file:///x.jpg' })).resolves.toBe('shared');
  expect(spy).toHaveBeenCalledWith({ message: 'MSG' });
});

it('reports a dismissed fallback share', async () => {
  jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.dismissedAction } as any);
  await expect(shareWithPreview({ message: 'MSG', title: 't', imageUri: null })).resolves.toBe('dismissed');
});
