import { Alert, Linking, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import type { AxiosInstance } from 'axios';
import { userApi } from './api';
import { toast } from '@/contexts/ToastContext';

/**
 * Subscribe a calendar app to one group's meetups. The link is a live feed, so new and changed meetups
 * show up on their own. Asks which app, then opens it (or copies the link).
 */
export async function addGroupToCalendar(api: AxiosInstance, groupId: string, groupName: string): Promise<void> {
    let url: string;
    try {
        ({ url } = await userApi.getCalendarSyncUrl(api, groupId));
    } catch (e: any) {
        toast.error(e?.response?.data?.message || "Couldn't create the calendar link. Try again.");
        return;
    }

    const copy = async () => {
        await Clipboard.setStringAsync(url);
        toast.success('Calendar link copied. Paste it into any calendar app as a subscription.');
    };

    Alert.alert(
        'Add to calendar',
        `Subscribe to "${groupName}" so its meetups appear in your calendar and stay up to date.`,
        [
            // Android's alert shows at most three buttons, and Apple Calendar isn't there anyway.
            ...(Platform.OS === 'ios'
                ? [{ text: 'Apple Calendar', onPress: () => Linking.openURL(url.replace(/^https?:\/\//, 'webcal://')).catch(copy) }]
                : []),
            {
                text: 'Google Calendar',
                onPress: () => WebBrowser.openBrowserAsync(`https://calendar.google.com/calendar/u/0/r/settings/addbyurl?hl=en&url=${encodeURIComponent(url)}`),
            },
            { text: 'Copy link', onPress: copy },
            { text: 'Cancel', style: 'cancel' },
        ]
    );
}
