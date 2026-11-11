import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Modal, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import DraggableList from '@/components/DraggableList';
import { useThemeColors } from '@/contexts/AppearanceContext';
import type { ThemeColors } from '@/constants/theme';

const ROW_H = 60;

export interface RankItem { id: string; label: string; picture?: string | null; sub?: string }

interface Props {
  visible: boolean;
  title: string;
  hint?: string;
  items: RankItem[];
  onCancel: () => void;
  onDone: (ids: string[]) => void;
}

/** Full-screen numbered list: press and hold a row, then drag it up (stronger) or down. */
export default function RankingEditor({ visible, title, hint, items, onCancel, onDone }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [ids, setIds] = useState<string[]>([]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  useEffect(() => {
    if (visible) setIds(items.map((i) => i.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const slotTops = ids.map((_, i) => i * ROW_H);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onCancel}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.headerBar}>
            <PressableOpacity onPress={onCancel} style={{ minWidth: 60 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.cancel}>Cancel</Text>
            </PressableOpacity>
            <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
            <PressableOpacity onPress={() => onDone(ids)} style={{ minWidth: 60, alignItems: 'flex-end' }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.done}>Done</Text>
            </PressableOpacity>
          </View>
          <DraggableList
            data={ids.map((id) => ({ id }))}
            rowHeight={ROW_H}
            slotTops={slotTops}
            contentHeight={ids.length * ROW_H}
            onReorder={setIds}
            header={
              <Text style={styles.hint}>
                {hint || 'Press and hold, then drag. Higher up means stronger.'}
              </Text>
            }
            footer={<View style={{ height: 80 }} />}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
            renderRow={(item, index) => {
              const it = byId.get(item.id);
              return (
                <View style={styles.row}>
                  <View style={styles.rank}><Text style={styles.rankText}>{index + 1}</Text></View>
                  {it?.picture
                    ? <Image source={{ uri: it.picture }} style={styles.avatar} />
                    : <View style={[styles.avatar, styles.avatarEmpty]}><Feather name="user" size={16} color={colors.textFaint} /></View>}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName} numberOfLines={1}>{it?.label ?? 'Player'}</Text>
                    {it?.sub ? <Text style={styles.rowSub} numberOfLines={1}>{it.sub}</Text> : null}
                  </View>
                  <Feather name="menu" size={18} color={colors.textFaint} />
                </View>
              );
            }}
          />
        </SafeAreaView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  headerBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: colors.textPrimary },
  cancel: { fontSize: 16, color: colors.textMuted, fontWeight: '600' },
  done: { fontSize: 16, color: colors.brand, fontWeight: '800' },
  hint: { fontSize: 13, color: colors.textMuted, lineHeight: 18, marginVertical: 10 },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, marginBottom: 6 },
  rank: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(79,209,197,0.16)', alignItems: 'center', justifyContent: 'center' },
  rankText: { fontSize: 13, fontWeight: '800', color: colors.success },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  avatarEmpty: { backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  rowName: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  rowSub: { fontSize: 12, color: colors.textMuted },
});
