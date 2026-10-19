import React from 'react';
import { View, Text, ViewStyle, TextStyle } from 'react-native';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { Feather } from '@expo/vector-icons';
import { useThemeColors } from '@/contexts/AppearanceContext';
import type { ThemeColors } from '@/constants/theme';

export type LocationFieldVariant = 'wizard' | 'card' | 'modal';

interface VariantStyle {
  container: ViewStyle;
  text: TextStyle;
  iconName: keyof typeof Feather.glyphMap | null;
  iconSize: number;
  iconColor: string;
  iconMarginRight: number;
}

const getVariantStyles = (colors: ThemeColors): Record<LocationFieldVariant, VariantStyle> => ({
  // create-group/index.tsx, AddMeetupWizard.tsx
  wizard: {
    container: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12 },
    text: { flex: 1, fontSize: 15, color: colors.textSecondary },
    iconName: 'map-pin',
    iconSize: 16,
    iconColor: colors.textFaint,
    iconMarginRight: 8,
  },
  // MeetupDetailModal.tsx edit modal
  card: {
    container: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.backgroundAlt, borderRadius: 14, paddingHorizontal: 16, height: 56, borderWidth: 1, borderColor: colors.border },
    text: { flex: 1, marginLeft: 12, fontSize: 16, color: colors.textSecondary },
    iconName: 'map-pin',
    iconSize: 18,
    iconColor: colors.brand,
    iconMarginRight: 0,
  },
  // group-settings/[id].tsx edit-location modal
  modal: {
    container: { backgroundColor: colors.backgroundAlt, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 16 },
    text: { fontSize: 16, color: colors.textPrimary },
    iconName: null,
    iconSize: 0,
    iconColor: 'transparent',
    iconMarginRight: 0,
  },
});

interface LocationFieldProps {
  value: string;
  placeholder?: string;
  onPress: () => void;
  variant?: LocationFieldVariant;
}

const LocationField = ({ value, placeholder, onPress, variant = 'wizard' }: LocationFieldProps) => {
  const colors = useThemeColors();
  const style = getVariantStyles(colors)[variant];
  const hasValue = value.trim().length > 0;

  return (
    <PressableOpacity style={style.container} onPress={onPress} activeOpacity={0.7}>
      {style.iconName && (
        <Feather name={style.iconName} size={style.iconSize} color={style.iconColor} style={{ marginRight: style.iconMarginRight }} />
      )}
      <Text style={[style.text, !hasValue && { color: colors.placeholder }]} numberOfLines={1}>
        {hasValue ? value : (placeholder ?? '')}
      </Text>
    </PressableOpacity>
  );
};

export default LocationField;
