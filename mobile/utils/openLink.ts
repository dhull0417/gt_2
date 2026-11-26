import { Alert, Linking, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { isHttpUrl } from './videoLinks';
import type { LinkKind } from './linkify';

export function openAddressInMaps(address: string) {
  const query = encodeURIComponent(address);
  const url = Platform.OS === 'ios' ? `maps:0,0?q=${query}` : `geo:0,0?q=${query}`;
  Linking.openURL(url).catch(() => {
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`).catch(() => {
      Alert.alert('Error', 'Could not open a navigation app.');
    });
  });
}

// Meetup "location" fields can be either a meeting link or a street address.
export function openLocation(address: string) {
  if (isHttpUrl(address)) {
    Linking.openURL(address.trim()).catch(() => Alert.alert('Error', 'Could not open this link.'));
    return;
  }
  openAddressInMaps(address);
}

export function openLink(kind: LinkKind, value: string) {
  switch (kind) {
    case 'address':
      return openAddressInMaps(value);
    case 'email':
      return Linking.openURL(`mailto:${value}`).catch(() => Alert.alert('Error', 'Could not open your email app.'));
    case 'phone':
      return Linking.openURL(`tel:${value}`).catch(() => Alert.alert('Error', 'Could not start the call.'));
    default:
      return Linking.openURL(value).catch(() => Alert.alert('Error', 'Could not open this link.'));
  }
}

export async function copyLink(text: string) {
  await Clipboard.setStringAsync(text);
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}
