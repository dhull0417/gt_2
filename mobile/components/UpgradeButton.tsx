import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/expo';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { useApiClient, userApi, type User } from '@/utils/api';

/**
 * "Get Premium" button for Premium lock rows. Premium belongs to the group's OWNER, so only the
 * owner gets the button (a member buying Premium would not unlock anything in this group).
 * Pass group.owner (id or populated user); renders nothing for anyone else.
 */
export function UpgradeButton({ owner, style }: { owner?: string | { _id: string } | null; style?: object }) {
  const ownerId = typeof owner === 'string' ? owner : owner?._id;
  const colors = useThemeColors();
  const router = useRouter();
  const api = useApiClient();
  const { isSignedIn } = useAuth();
  const { data: me } = useQuery<User, Error>({
    queryKey: ['currentUser'],
    queryFn: () => userApi.getCurrentUser(api),
    enabled: !!isSignedIn,
  });

  if (!ownerId || !me || me._id !== ownerId || me.isPremium) return null;

  return (
    <PressableOpacity
      onPress={() => router.push('/paywall')}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel="Get Premium"
      style={[styles.btn, { backgroundColor: colors.brand }, style]}
    >
      <Feather name="star" size={14} color="white" />
      <Text style={styles.text}>Get Premium</Text>
    </PressableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, marginTop: 10 },
  text: { color: 'white', fontSize: 13, fontWeight: '800' },
});
