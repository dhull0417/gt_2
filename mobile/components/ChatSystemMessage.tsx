import { StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '@/contexts/AppearanceContext';

// Centered, muted notice in the thread — "Sam joined the group", "Alex removed Jo".
export function ChatSystemMessage({ text }: { text: string }) {
  const colors = useThemeColors();
  return (
    <View style={styles.wrap}>
      <Text style={[styles.text, { color: colors.textFaint }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingHorizontal: 32, paddingVertical: 8 },
  text: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
});
