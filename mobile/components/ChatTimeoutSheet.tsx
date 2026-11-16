import React from 'react';
import { Text, Modal, StyleSheet, ScrollView, View } from 'react-native';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { Feather } from '@expo/vector-icons';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { TIMEOUT_OPTIONS, formatTimeoutEnd, isTimeoutActive, type ChatTimeoutInfo, type TimeoutKey } from '@/utils/chatTimeout';

interface Props {
  visible: boolean;
  /** First name of the person being timed out. */
  name: string;
  /** Their current timeout, if any (shows when it ends and an End timeout button). */
  current?: ChatTimeoutInfo | null;
  onPick: (key: TimeoutKey) => void;
  onEnd: () => void;
  onClose: () => void;
}

// Owner/moderator picker: how long to stop someone from chatting in this group.
// Same presentation as OptionPickerModal. Picking a length replaces any current timeout.
export function ChatTimeoutSheet({ visible, name, current, onPick, onEnd, onClose }: Props) {
  const colors = useThemeColors();
  if (!visible) return null;
  const active = isTimeoutActive(current, Date.now());

  return (
    <Modal animationType="fade" transparent visible onRequestClose={onClose}>
      <PressableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <PressableOpacity activeOpacity={1} style={[styles.card, { backgroundColor: colors.surface }]} onPress={() => {}}>
          <Text style={[styles.title, { color: colors.textFaint }]} numberOfLines={1}>Time out {name}</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            {active
              ? `Timed out ${formatTimeoutEnd(current!.until, new Date())}. Pick a new length to replace it.`
              : `${name} won't be able to chat, react or edit messages here. Polls and RSVPs still work. Only ${name} and moderators will know.`}
          </Text>

          {active && (
            <PressableOpacity style={[styles.endBtn, { backgroundColor: colors.backgroundAlt }]} onPress={onEnd}>
              <Feather name="unlock" size={16} color={colors.brand} />
              <Text style={[styles.endText, { color: colors.brand }]}>End timeout</Text>
            </PressableOpacity>
          )}

          <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
            {TIMEOUT_OPTIONS.map((opt) => (
              <PressableOpacity key={opt.key} style={styles.row} onPress={() => onPick(opt.key)}>
                <Text style={[styles.rowText, { color: colors.textSecondary }]}>{opt.label}</Text>
                <Feather name="clock" size={16} color={colors.textFaint} />
              </PressableOpacity>
            ))}
          </ScrollView>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <PressableOpacity style={styles.cancel} onPress={onClose}>
            <Text style={[styles.cancelText, { color: colors.textMuted }]}>Cancel</Text>
          </PressableOpacity>
        </PressableOpacity>
      </PressableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)', padding: 24 },
  card: { width: '100%', maxWidth: 340, borderRadius: 20, padding: 16 },
  title: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, textAlign: 'center' },
  subtitle: { fontSize: 13, lineHeight: 18, textAlign: 'center', marginBottom: 10, paddingHorizontal: 6 },
  endBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12, marginBottom: 6 },
  endText: { fontSize: 15, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, paddingHorizontal: 10, borderRadius: 10 },
  rowText: { fontSize: 15, fontWeight: '600' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 6 },
  cancel: { paddingVertical: 12, alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600' },
});
