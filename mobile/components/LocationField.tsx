import React from 'react';
import { View, Text, TouchableOpacity, ViewStyle, TextStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';

export type LocationFieldVariant = 'wizard' | 'card' | 'modal';

interface VariantStyle {
  container: ViewStyle;
  text: TextStyle;
  iconName: keyof typeof Feather.glyphMap | null;
  iconSize: number;
  iconColor: string;
  iconMarginRight: number;
}

const VARIANT_STYLES: Record<LocationFieldVariant, VariantStyle> = {
  // create-group/index.tsx, AddMeetupWizard.tsx
  wizard: {
    container: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 12 },
    text: { flex: 1, fontSize: 15, color: '#374151' },
    iconName: 'map-pin',
    iconSize: 16,
    iconColor: '#9CA3AF',
    iconMarginRight: 8,
  },
  // MeetupDetailModal.tsx edit modal
  card: {
    container: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 14, paddingHorizontal: 16, height: 56, borderWidth: 1, borderColor: '#E5E7EB' },
    text: { flex: 1, marginLeft: 12, fontSize: 16, color: '#374151' },
    iconName: 'map-pin',
    iconSize: 18,
    iconColor: '#4A90E2',
    iconMarginRight: 0,
  },
  // group-settings/[id].tsx edit-location modal
  modal: {
    container: { backgroundColor: '#F3F4F6', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 16 },
    text: { fontSize: 16, color: '#111827' },
    iconName: null,
    iconSize: 0,
    iconColor: 'transparent',
    iconMarginRight: 0,
  },
};

interface LocationFieldProps {
  value: string;
  placeholder?: string;
  onPress: () => void;
  variant?: LocationFieldVariant;
}

const LocationField = ({ value, placeholder, onPress, variant = 'wizard' }: LocationFieldProps) => {
  const style = VARIANT_STYLES[variant];
  const hasValue = value.trim().length > 0;

  return (
    <TouchableOpacity style={style.container} onPress={onPress} activeOpacity={0.7}>
      {style.iconName && (
        <Feather name={style.iconName} size={style.iconSize} color={style.iconColor} style={{ marginRight: style.iconMarginRight }} />
      )}
      <Text style={[style.text, !hasValue && { color: '#C4C9D4' }]} numberOfLines={1}>
        {hasValue ? value : (placeholder ?? '')}
      </Text>
    </TouchableOpacity>
  );
};

export default LocationField;
