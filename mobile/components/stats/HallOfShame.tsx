import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useThemeColors } from '@/contexts/AppearanceContext';
import type { ThemeColors } from '@/constants/theme';
import type { GroupStats, StatsAward } from '@/utils/api';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { AwardCard } from './AwardCard';

type Viewer = NonNullable<GroupStats['viewer']>;

/**
 * Joke awards. Organizers always see this with a "Reveal to the group" switch; members
 * only get it (from the server) once revealed.
 */
export function HallOfShame({ awards, viewer, onToggleReveal, saving, onOpen, labelStyle }: {
  awards: StatsAward[];
  viewer: Viewer;
  onToggleReveal: (next: boolean) => void;
  saving: boolean;
  onOpen: (a: StatsAward) => void;
  labelStyle: object;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (!viewer.isOrganizer && awards.length === 0) return null;

  return (
    <View>
      <Text style={labelStyle}>Hall of Shame</Text>
      {viewer.isOrganizer && (
        <View style={styles.revealCard}>
          <Feather name={viewer.revealJokes ? 'eye' : 'eye-off'} size={18} color={colors.textMuted} />
          <View style={{ flex: 1 }}>
            <Text style={styles.revealTitle}>Reveal to the group</Text>
            <Text style={styles.revealText}>
              {viewer.revealJokes ? 'Everyone in the group can see these.' : 'Only organizers can see these right now.'}
            </Text>
          </View>
          {saving
            ? <ActivityIndicator size="small" color={colors.brand} />
            : <ToggleSwitch value={viewer.revealJokes} onValueChange={onToggleReveal} accessibilityLabel="Reveal the Hall of Shame to the group" />}
        </View>
      )}
      {awards.length === 0 ? (
        <Text style={styles.empty}>Nobody qualifies yet. Give it a few meetups.</Text>
      ) : (
        <View style={styles.grid}>
          {awards.map((a) => <AwardCard key={a.key} award={a} onPress={() => onOpen(a)} />)}
        </View>
      )}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  revealCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 10,
  },
  revealTitle: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  revealText: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  empty: { fontSize: 13, color: colors.textMuted },
});
