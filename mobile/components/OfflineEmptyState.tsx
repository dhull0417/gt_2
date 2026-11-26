import { View, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { useThemeColors } from '@/contexts/AppearanceContext';

/**
 * Shown in place of a list or screen that was opened offline with nothing saved for it yet
 * (see isOfflineEmpty in utils/offlineState.ts). Retry is optional: the data also loads by
 * itself as soon as the connection is back.
 */
export function OfflineEmptyState({ message = 'Connect to the internet to load this.', onRetry, onBack }: {
  message?: string;
  onRetry?: () => void;
  /** For full screens whose loading state has no header: a way out. */
  onBack?: () => void;
}) {
  const colors = useThemeColors();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <Feather name="wifi-off" size={32} color={colors.textMuted} />
      <Text style={{ fontSize: 17, fontWeight: '700', color: colors.textPrimary, marginTop: 12, textAlign: 'center' }}>You're offline</Text>
      <Text style={{ fontSize: 15, color: colors.textMuted, marginTop: 6, textAlign: 'center', lineHeight: 21 }}>{message}</Text>
      {onBack && (
        <PressableOpacity onPress={onBack} style={{ marginTop: 20, backgroundColor: colors.backgroundAlt, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28 }}>
          <Text style={{ color: colors.textMuted, fontWeight: '700', fontSize: 16 }}>Back</Text>
        </PressableOpacity>
      )}
      {onRetry && (
        <PressableOpacity onPress={onRetry} style={{ marginTop: 20, backgroundColor: colors.brand, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28 }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Try again</Text>
        </PressableOpacity>
      )}
    </View>
  );
}
