import React from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useThemeColors } from '@/contexts/AppearanceContext';

/** Round profile photo with a person-icon fallback. */
export function StatsAvatar({ uri, size = 28, ring }: { uri?: string | null; size?: number; ring?: string }) {
  const colors = useThemeColors();
  const style = { width: size, height: size, borderRadius: size / 2, borderWidth: ring ? 2 : 0, borderColor: ring };
  if (uri) return <Image source={{ uri }} style={style} transition={150} />;
  return (
    <View style={[style, { backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' }]}>
      <Feather name="user" size={size * 0.5} color={colors.textFaint} />
    </View>
  );
}

export const personName = (p: { firstName?: string; lastName?: string }) =>
  `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || 'Member';
