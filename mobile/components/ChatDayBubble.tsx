import { View, Text, StyleSheet } from 'react-native';

interface Props {
  label: string;
}

export function ChatDayBubble({ label }: Props) {
  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={styles.pill}>
        <Text style={styles.label}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 8 },
  pill: {
    backgroundColor: '#F9FAFBF2',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    letterSpacing: 0.3,
  },
});
