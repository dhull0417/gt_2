import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { useThemeColors } from '@/contexts/AppearanceContext';
import type { ThemeColors } from '@/constants/theme';
import type { StatsAward } from '@/utils/api';
import { AWARD_BLURBS, formatAwardValue } from '@/utils/statsFormat';
import { StatsAvatar, personName } from './StatsAvatar';

/** Bottom sheet with how an award is decided and its top 5. */
export function AwardSheet({ award, onClose }: { award: StatsAward | null; onClose: () => void }) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={!!award} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      {award && (
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <View style={styles.handle} />
          <View style={styles.headRow}>
            <Text style={styles.emoji}>{award.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{award.title}</Text>
              <Text style={styles.blurb}>{AWARD_BLURBS[award.key]}</Text>
            </View>
            <PressableOpacity onPress={onClose} accessibilityLabel="Close" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Feather name="x" size={22} color={colors.textMuted} />
            </PressableOpacity>
          </View>
          {award.leaderboard.map((p, i) => (
            <View key={p._id} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
              <Text style={[styles.rank, p.rank === 1 && { color: colors.brand }]}>{p.rank}</Text>
              <StatsAvatar uri={p.profilePicture} size={34} />
              <Text style={styles.name} numberOfLines={1}>{personName(p)}</Text>
              {p.value !== null && <Text style={styles.value}>{formatAwardValue(award.key, p.value)}</Text>}
            </View>
          ))}
          {award.joke && <Text style={styles.footnote}>All in good fun.</Text>}
        </View>
      )}
    </Modal>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 10 },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: 12 },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  emoji: { fontSize: 34 },
  title: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  blurb: { fontSize: 13, color: colors.textMuted, marginTop: 2, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rank: { width: 20, fontSize: 15, fontWeight: '800', color: colors.textFaint, textAlign: 'center' },
  name: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  value: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  footnote: { fontSize: 12, color: colors.textFaint, textAlign: 'center', marginTop: 8 },
});
