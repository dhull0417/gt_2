import React from 'react';
import { View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { useGetNotifications } from '@/hooks/useGetNotifications';
import { useThemeColors } from '@/contexts/AppearanceContext';

/** Bell with an unread dot; opens the notifications list. Used in the Home and Groups headers. */
export function NotificationBell() {
  const router = useRouter();
  const pathname = usePathname();
  const colors = useThemeColors();
  const { data: notifications } = useGetNotifications();
  const hasUnread = notifications?.some((n) => !n.read);
  return (
    <PressableOpacity
      accessibilityLabel={hasUnread ? 'Notifications, unread' : 'Notifications'}
      onPress={() => { if (pathname !== '/notifications') router.push('/notifications'); }}
    >
      <Feather name="bell" size={26} color={colors.brand} />
      {hasUnread && (
        <View style={{ position: 'absolute', top: 0, right: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: '#EF4444', borderWidth: 2, borderColor: colors.surface }} />
      )}
    </PressableOpacity>
  );
}
