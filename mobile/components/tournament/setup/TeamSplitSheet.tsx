// How players are split into teams: by team size or by number of teams.
import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { Segmented, Stepper, SettingSheet, makeStyles } from '@/components/tournament/ui';

export default function TeamSplitSheet({ visible, onClose, splitBy, value, totalPlayers, ranked, onSplitBy, onValue }: {
  visible: boolean; onClose: () => void; splitBy: 'size' | 'count'; value: number; totalPlayers: number; ranked: boolean;
  onSplitBy: (v: 'size' | 'count') => void; onValue: (n: number) => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const extra = totalPlayers % value;
  return (
    <SettingSheet visible={visible} title="Team split" onClose={onClose}>
      <Segmented value={splitBy} onChange={onSplitBy}
        options={[{ value: 'size', label: 'Team size' }, { value: 'count', label: 'Number of teams' }]} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
        <Text style={styles.body}>{splitBy === 'size' ? 'Players per team' : 'Teams'}</Text>
        <Stepper label={splitBy === 'size' ? 'players per team' : 'teams'} value={value} min={splitBy === 'size' ? 1 : 2} max={32} onChange={onValue} />
      </View>
      {splitBy === 'size' && extra !== 0 && totalPlayers >= value && (
        <Text style={styles.hint}>
          {totalPlayers} players can't be split evenly into teams of {value}, so the top {extra === 1 ? 'player plays' : `${extra} players each play`} on their own team{ranked ? ' (from your ranking)' : ' (picked at random without a ranking)'}.
        </Text>
      )}
    </SettingSheet>
  );
}
