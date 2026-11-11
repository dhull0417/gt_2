import React, { useMemo } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { makeStyles } from '@/components/tournament/ui';
import { bracketColumns, teamLabel } from '@/utils/tournament';
import type { Tournament, TMatch } from '@/utils/tournamentApi';

/** Bracket drawn as columns of rounds (scroll sideways). Losers bracket and grand final below. */
export default function BracketView({ tournament: t, meId, onPressMatch }: { tournament: Tournament; meId?: string; onPressMatch: (m: TMatch) => void }) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const cols = useMemo(() => bracketColumns(t), [t]);

  const Card = ({ m }: { m: TMatch }) => {
    const placeOf = (key: string | null) => m.results.find((r) => r.team === key)?.place;
    return (
      <PressableOpacity onPress={() => onPressMatch(m)} style={[styles.card, { padding: 8, width: 170, marginBottom: 10, opacity: m.status === 'bye' ? 0.55 : 1 }]}>
        {m.slots.map((s, i) => {
          const place = placeOf(s.team);
          const advanced = place !== undefined && place <= (m.advance ?? 1);
          const points = m.results.find((r) => r.team === s.team)?.points;
          return (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, color: s.team ? colors.textPrimary : colors.textFaint, fontWeight: advanced ? '800' : '500' }}>
                {s.team ? teamLabel(t, s.team, meId) : m.status === 'bye' ? '—' : 'TBD'}
              </Text>
              {points !== undefined && <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textSecondary }}>{points}</Text>}
            </View>
          );
        })}
        {m.status === 'bye' && <Text style={styles.hint}>Bye</Text>}
      </PressableOpacity>
    );
  };

  const Columns = ({ columns, title }: { columns: TMatch[][]; title?: string }) => (
    <View style={{ marginTop: 12 }}>
      {title ? <Text style={styles.sectionLabel}>{title}</Text> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {columns.map((col, i) => (
          <View key={i} style={{ marginRight: 12, justifyContent: 'space-around' }}>
            <Text style={[styles.hint, { marginBottom: 6 }]}>{i === columns.length - 1 && t.format === 'single' ? 'Final' : `Round ${i + 1}`}</Text>
            {col.map((m) => <Card key={m.id} m={m} />)}
          </View>
        ))}
      </ScrollView>
    </View>
  );

  return (
    <View>
      <Columns columns={cols.winners} title={t.format === 'double' ? 'Winners bracket' : undefined} />
      {cols.losers.length > 0 && <Columns columns={cols.losers} title="Losers bracket" />}
      {cols.final.length > 0 && (
        <View style={{ marginTop: 12 }}>
          <Text style={styles.sectionLabel}>Grand final</Text>
          {cols.final.map((m) => <Card key={m.id} m={m} />)}
        </View>
      )}
    </View>
  );
}
