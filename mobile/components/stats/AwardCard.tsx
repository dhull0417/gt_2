import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { useThemeColors } from '@/contexts/AppearanceContext';
import type { ThemeColors } from '@/constants/theme';
import type { StatsAward } from '@/utils/api';
import { formatAwardValue } from '@/utils/statsFormat';
import { StatsAvatar, personName } from './StatsAvatar';

/** One award in the grid: emoji, title, winner(s) and their number. Tap for the top 5. */
export function AwardCard({ award, onPress }: { award: StatsAward; onPress: () => void }) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const winners = award.winners;
  const first = winners[0];
  const names = winners.length === 1
    ? personName(first)
    : `${first?.firstName || 'Member'} + ${winners.length - 1} more`;
  const value = first?.value === null || first?.value === undefined ? null : formatAwardValue(award.key, first.value);

  return (
    <PressableOpacity
      onPress={onPress}
      style={[styles.card, award.joke && styles.jokeCard]}
      accessibilityLabel={`${award.title}: ${winners.map(personName).join(', ')}${value ? `, ${value}` : ''}`}
      accessibilityHint="Shows the top five"
    >
      <Text style={styles.emoji}>{award.emoji}</Text>
      <Text style={styles.title} numberOfLines={1}>{award.title}</Text>
      <View style={styles.winnerRow}>
        <View style={styles.avatars}>
          {winners.slice(0, 3).map((w, i) => (
            <View key={w._id} style={{ marginLeft: i === 0 ? 0 : -8 }}>
              <StatsAvatar uri={w.profilePicture} size={24} ring={colors.surface} />
            </View>
          ))}
        </View>
        <Text style={styles.name} numberOfLines={1}>{names}</Text>
      </View>
      {value && <Text style={styles.value} numberOfLines={1}>{value}</Text>}
    </PressableOpacity>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  card: {
    width: '48.5%', backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border,
    padding: 12, marginBottom: 10,
  },
  jokeCard: { borderStyle: 'dashed', borderColor: colors.borderStrong },
  emoji: { fontSize: 28 },
  title: { fontSize: 14, fontWeight: '800', color: colors.textPrimary, marginTop: 6 },
  winnerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  avatars: { flexDirection: 'row' },
  name: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  value: { fontSize: 12, fontWeight: '700', color: colors.brand, marginTop: 6 },
});
