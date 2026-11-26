// Strength ranking: saved lists, the order itself, and what it's used for (balance, finale).
import React, { useMemo } from 'react';
import { View, Text, TextInput, Switch } from 'react-native';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { SettingSheet, makeStyles } from '@/components/tournament/ui';
import type { RankingList, TMode, TFormat } from '@/utils/tournamentApi';

function ToggleRow({ title, sub, value, onChange }: { title: string; sub: string; value: boolean; onChange: (v: boolean) => void }) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 }}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={styles.optionLabel}>{title}</Text>
        <Text style={styles.optionSub}>{sub}</Text>
      </View>
      <Switch accessibilityLabel={title} value={value} onValueChange={onChange}
        trackColor={{ true: colors.brand, false: colors.borderStrong }} thumbColor="#FFFFFF" ios_backgroundColor={colors.borderStrong} />
    </View>
  );
}

export default function RankingSheet(p: {
  visible: boolean; onClose: () => void;
  on: boolean; onToggle: (v: boolean) => void;
  mode: TMode; format: TFormat;
  lists: RankingList[]; listId: string | null; onPickList: (id: string | null) => void;
  preview: string; count: number; onEditRanking: () => void;
  newListName: string; onNewListName: (s: string) => void; onSaveList: () => void; saving: boolean;
  balance: boolean; finale: boolean; onBalance: (v: boolean) => void; onFinale: (v: boolean) => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const canSave = !!p.newListName.trim() && !p.saving;
  return (
    <SettingSheet visible={p.visible} title="Strength ranking" onClose={p.onClose}>
      <ToggleRow title="Use a strength ranking" sub="Off means everything is random." value={p.on} onChange={p.onToggle} />
      {p.on && (
        <>
          {p.lists.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              {p.lists.map((l) => {
                const on = p.listId === l._id;
                return (
                  <PressableOpacity key={l._id} onPress={() => p.onPickList(on ? null : l._id)} style={[styles.chip, on && styles.chipOn]}>
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{l.name}</Text>
                  </PressableOpacity>
                );
              })}
            </View>
          )}
          <PressableOpacity onPress={p.onEditRanking} style={styles.secondaryBtn}>
            <Text style={styles.secondaryText}>Edit ranking ({p.count})</Text>
          </PressableOpacity>
          <Text style={styles.hint} numberOfLines={2}>{p.preview}</Text>
          {p.lists.length < 10 && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' }}>
              <TextInput value={p.newListName} onChangeText={p.onNewListName} maxLength={30} placeholder="Save as a list (name)"
                placeholderTextColor={colors.placeholder}
                style={{ flex: 1, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, color: colors.textPrimary }} />
              <PressableOpacity onPress={p.onSaveList} disabled={!canSave}>
                <Text style={[styles.action, !canSave && { opacity: 0.4 }]}>Save</Text>
              </PressableOpacity>
            </View>
          )}
          <View style={[styles.divider, { marginTop: 12 }]} />
          {p.mode === 'teams' && <ToggleRow title="Balance teams" sub="Spread strong and weaker players evenly." value={p.balance} onChange={p.onBalance} />}
          {p.format !== 'none' && (
            <ToggleRow title="Build to a finale" value={p.finale} onChange={p.onFinale}
              sub={p.format === 'roundRobin' ? 'Mismatches first; the top two meet last.' : 'Top seeds can only meet late in the bracket.'} />
          )}
        </>
      )}
    </SettingSheet>
  );
}
