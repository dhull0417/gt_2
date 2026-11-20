// Who's playing: everyone who's In (locked), plus members who haven't answered yet.
import React, { useMemo } from 'react';
import { Text } from 'react-native';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { OptionRow, SettingSheet, makeStyles } from '@/components/tournament/ui';

export default function PlayersSheet({ visible, onClose, inRows, undecided, extra, onToggle }: {
  visible: boolean; onClose: () => void;
  inRows: { id: string; label: string; sub: string }[];
  undecided: { id: string; label: string }[];
  extra: string[];
  onToggle: (id: string) => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <SettingSheet visible={visible} title="Players" onClose={onClose}>
      {inRows.map((r) => <OptionRow key={r.id} check="box" selected disabled label={r.label} sub={r.sub} onPress={() => {}} />)}
      {undecided.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Also add (haven't answered)</Text>
          {undecided.map((r) => (
            <OptionRow key={r.id} check="box" selected={extra.includes(r.id)} label={r.label} onPress={() => onToggle(r.id)} />
          ))}
        </>
      )}
    </SettingSheet>
  );
}
