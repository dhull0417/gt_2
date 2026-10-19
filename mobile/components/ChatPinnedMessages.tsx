import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { Feather } from '@expo/vector-icons';
import { useThemeColors } from '@/contexts/AppearanceContext';
import type { ChatMessage } from '@/types/chat';

const summary = (m: ChatMessage) => m.content?.trim() || (m.image_url ? '📷 Photo' : '');

// Slim bar under the chat header showing the most recent pinned message. Tap to see them all.
export function ChatPinnedBanner({ pins, onPress }: { pins: ChatMessage[]; onPress: () => void }) {
  const colors = useThemeColors();
  if (pins.length === 0) return null;
  const latest = pins[0];
  return (
    <PressableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.banner, { backgroundColor: colors.backgroundAlt, borderBottomColor: colors.border }]}
      accessibilityLabel="Pinned messages"
    >
      <Feather name="map-pin" size={14} color={colors.brand} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.bannerLabel, { color: colors.brand }]}>
          {pins.length > 1 ? `Pinned · ${pins.length}` : 'Pinned'}
        </Text>
        <Text style={[styles.bannerText, { color: colors.textPrimary }]} numberOfLines={1}>
          {latest.sender_name}: {summary(latest)}
        </Text>
      </View>
      <Feather name="chevron-right" size={16} color={colors.textFaint} />
    </PressableOpacity>
  );
}

interface ModalProps {
  visible: boolean;
  pins: ChatMessage[];
  onClose: () => void;
  canUnpin: boolean;
  onUnpin: (m: ChatMessage) => void;
}

export function ChatPinnedModal({ visible, pins, onClose, canUnpin, onUnpin }: ModalProps) {
  const colors = useThemeColors();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.panel, { backgroundColor: colors.surface }]} onPress={() => {}}>
          <View style={styles.panelHeader}>
            <Text style={{ fontSize: 16, fontWeight: '900', color: colors.textPrimary }}>Pinned messages</Text>
            <PressableOpacity onPress={onClose} hitSlop={10}>
              <Feather name="x" size={20} color={colors.textFaint} />
            </PressableOpacity>
          </View>
          <FlatList
            data={pins}
            keyExtractor={(m) => m.id}
            ListEmptyComponent={
              <Text style={{ color: colors.textFaint, textAlign: 'center', paddingVertical: 24 }}>Nothing pinned.</Text>
            }
            ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />}
            renderItem={({ item }) => (
              <View style={styles.item}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textMuted }}>
                    {item.sender_name} · {new Date(item.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  </Text>
                  <Text style={{ fontSize: 15, color: colors.textPrimary, marginTop: 2 }}>{summary(item)}</Text>
                </View>
                {canUnpin && (
                  <PressableOpacity onPress={() => onUnpin(item)} hitSlop={8} accessibilityLabel="Unpin">
                    <Feather name="x-circle" size={20} color={colors.textFaint} />
                  </PressableOpacity>
                )}
              </View>
            )}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bannerLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  bannerText: { fontSize: 14, fontWeight: '500' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  panel: { borderRadius: 20, padding: 16, maxHeight: '70%' },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
});
