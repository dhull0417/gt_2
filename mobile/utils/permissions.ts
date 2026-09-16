import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AxiosInstance } from 'axios';

export type PermissionType = 'notifications' | 'location' | 'photoLibrary';
export type PermissionState = 'granted' | 'denied' | 'undetermined';
type PermissionMap = Partial<Record<PermissionType, PermissionState>>;

const LAST_SYNCED_KEY = 'GT2_LAST_SYNCED_PERMISSIONS';

/** Reports current permission state to the backend. Silent — swallows errors like the rest of this app's fire-and-forget calls. */
export async function reportPermissionStatus(api: AxiosInstance, updates: PermissionMap): Promise<void> {
  if (Object.keys(updates).length === 0) return;
  try {
    await api.patch('/api/users/permissions', { permissions: updates });
  } catch (err: any) {
    if (err.response?.status !== 401) console.error("Failed to report permission status", err);
  }
}

/** Reads current OS permission state without prompting (get*, never request*). One module failing shouldn't drop the others. */
export async function checkAllPermissions(): Promise<PermissionMap> {
  const [notifications, location, photoLibrary] = await Promise.allSettled([
    Notifications.getPermissionsAsync(),
    Location.getForegroundPermissionsAsync(),
    ImagePicker.getMediaLibraryPermissionsAsync(),
  ]);

  const result: PermissionMap = {};
  if (notifications.status === 'fulfilled') result.notifications = notifications.value.status as PermissionState;
  if (location.status === 'fulfilled') result.location = location.value.status as PermissionState;
  if (photoLibrary.status === 'fulfilled') result.photoLibrary = photoLibrary.value.status as PermissionState;
  return result;
}

/** Silent, no-popup sync — call on app startup. Only hits the backend when something actually changed since the last sync. */
export async function syncPermissionsIfChanged(api: AxiosInstance): Promise<void> {
  const current = await checkAllPermissions();

  let lastSynced: PermissionMap = {};
  try {
    const raw = await AsyncStorage.getItem(LAST_SYNCED_KEY);
    if (raw) lastSynced = JSON.parse(raw);
  } catch {
    // Corrupt/missing cache — treat as if nothing was synced before.
  }

  const changed: PermissionMap = {};
  for (const [type, status] of Object.entries(current) as [PermissionType, PermissionState][]) {
    if (lastSynced[type] !== status) changed[type] = status;
  }
  if (Object.keys(changed).length === 0) return;

  await reportPermissionStatus(api, changed);
  await AsyncStorage.setItem(LAST_SYNCED_KEY, JSON.stringify({ ...lastSynced, ...changed }));
}
