import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeColors } from '@/contexts/AppearanceContext';
import type { ThemeColors } from '@/constants/theme';
import type { GroupStats, StatsAward } from '@/utils/api';
import { formatAwardValue, formatRank } from '@/utils/statsFormat';

type Me = NonNullable<GroupStats['me']>;
type MemberRow = GroupStats['members'][number];

/** The viewer's own numbers and where they rank in each award they can see. */
export function YourStatsCard({ me, member, awards }: { me: Me; member?: MemberRow; awards: StatsAward[] }) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const byKey = new Map(awards.map((a) => [a.key, a]));
  const ranked = me.categories.filter((c) => c.rank !== null && byKey.has(c.key));

  return (
    <View style={styles.card}>
      {member && member.eligible > 0 ? (
        <View style={styles.numbers}>
          <View style={styles.num}><Text style={styles.numValue}>{Math.round(member.rate * 100)}%</Text><Text style={styles.numLabel}>Showed up</Text></View>
          <View style={styles.num}><Text style={styles.numValue}>{member.attended}/{member.eligible}</Text><Text style={styles.numLabel}>Meetups In</Text></View>
          <View style={styles.num}><Text style={styles.numValue}>{member.bestStreak ?? member.streak}</Text><Text style={styles.numLabel}>Best streak</Text></View>
        </View>
      ) : (
        <Text style={styles.empty}>Your numbers show up after your first meetup in this group.</Text>
      )}
      {member && member.eligible > 0 && member.declined !== null && member.noResponse !== null && (
        <Text style={styles.outs}>{member.declined} out · {member.noResponse} no reply</Text>
      )}
      {ranked.length > 0 ? ranked.map((c) => {
        const a = byKey.get(c.key)!;
        return (
          <View key={c.key} style={styles.row}>
            <Text style={styles.rowEmoji}>{a.emoji}</Text>
            <Text style={styles.rowTitle} numberOfLines={1}>{a.title}</Text>
            <Text style={styles.rowValue}>{formatAwardValue(c.key, c.value)}</Text>
            <Text style={[styles.rowRank, c.rank === 1 && { color: colors.brand }]}>{formatRank(c.rank, c.of)}</Text>
          </View>
        );
      }) : member && member.eligible > 0 ? (
        <Text style={styles.empty}>Not on any leaderboard yet. Keep showing up!</Text>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14 },
  numbers: { flexDirection: 'row', marginBottom: 6 },
  num: { flex: 1, alignItems: 'center' },
  numValue: { fontSize: 20, fontWeight: '900', color: colors.textPrimary },
  numLabel: { fontSize: 11, fontWeight: '700', color: colors.textFaint, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderTopWidth: 1, borderTopColor: colors.border },
  rowEmoji: { fontSize: 18 },
  rowTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  rowValue: { fontSize: 12, color: colors.textMuted },
  rowRank: { fontSize: 13, fontWeight: '800', color: colors.textSecondary, minWidth: 54, textAlign: 'right' },
  outs: { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginBottom: 6 },
  empty: { fontSize: 13, color: colors.textMuted, lineHeight: 19, paddingVertical: 4 },
});
