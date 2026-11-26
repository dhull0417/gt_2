import React from 'react';
import { View, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { GroupAvatar } from '@/components/GroupAvatar';
import { useThemeColors } from '@/contexts/AppearanceContext';

// Fixed height of the logo + name + subtitle row. The chat header and the group details header both
// use this component, so the logo sits in exactly the same spot on both screens and doesn't jump when
// one slides over the other. Fits the name line (28) + the subtitle line (16).
export const GROUP_HEADER_TITLE_HEIGHT = 44;

interface Props {
  name: string;
  imageUrl?: string | null;
  // Second line under the name, e.g. "5 members · Tap for info". The row keeps its height without it.
  subtitle?: string;
  // A small › after the name, to show the title can be tapped (chat header → group details).
  showChevron?: boolean;
}

export function GroupHeaderTitle({ name, imageUrl, subtitle, showChevron }: Props) {
  const colors = useThemeColors();
  return (
    <View testID="group-header-title" style={{ flexDirection: 'row', alignItems: 'center', flex: 1, height: GROUP_HEADER_TITLE_HEIGHT }}>
      <View style={{ marginRight: 10 }}>
        <GroupAvatar name={name} imageUrl={imageUrl} size={36} borderRadius={9} />
      </View>
      <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text className="text-lg font-black text-gray-900 dark:text-white" numberOfLines={1} style={{ flexShrink: 1 }}>
            {name}
          </Text>
          {showChevron && (
            <Feather name="chevron-right" size={18} color={colors.textFaint} style={{ marginLeft: 2, marginTop: 1 }} />
          )}
        </View>
        {/* Always takes its line, even when empty, so the name never shifts up or down. */}
        <View style={{ height: 16 }}>
          {!!subtitle && (
            <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.textSecondary }} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}
