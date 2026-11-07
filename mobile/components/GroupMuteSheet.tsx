import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { useAppearance, useThemeColors } from '@/contexts/AppearanceContext';
import { toast } from '@/contexts/ToastContext';
import { haptic } from '@/utils/haptics';
import { User, useApiClient, userApi } from '@/utils/api';
import {
  MUTE_KINDS,
  MuteKind,
  MuteRequest,
  applyMuteLocally,
  describeMute,
  muteStateFor,
  restoreRequest,
} from '@/utils/groupMute';

type Props = {
  visible: boolean;
  group: { _id: string; name?: string; isDM?: boolean } | null | undefined;
  currentUser: User | null | undefined;
  onClose: () => void;
};

const ALL: MuteKind[] = MUTE_KINDS.map((k) => k.key);

/**
 * The one mute sheet for a group, opened from the chat header bell and from the Groups-list
 * swipe. Members pick which kinds to mute, then how long. Saves optimistically.
 */
export function GroupMuteSheet({ visible, group: groupProp, currentUser, onClose }: Props) {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const colors = useThemeColors();
  const { scheme } = useAppearance();
  const isDark = scheme === 'dark';

  // Keep showing the last group while the sheet fades out after the caller clears it.
  const lastGroup = useRef(groupProp);
  if (groupProp) lastGroup.current = groupProp;
  const group = groupProp ?? lastGroup.current;

  const groupId = group?._id ?? '';
  const isDM = !!group?.isDM;
  const kinds = isDM ? MUTE_KINDS.filter((k) => k.key === 'chat') : MUTE_KINDS;
  const current = muteStateFor(currentUser, groupId);
  const [selected, setSelected] = useState<MuteKind[]>(ALL);
  // True once the member flips a switch, so late-arriving user data doesn't overwrite their choice.
  const touched = useRef(false);
  const currentKey = `${current.state}:${current.until}:${current.mutedTypes.join(',')}`;

  // Each time the sheet opens, start from what is muted now (or everything, if nothing is).
  useEffect(() => {
    if (!visible) { touched.current = false; return; }
    if (touched.current) return;
    if (current.state === 'none') setSelected(isDM ? ['chat'] : ALL);
    else setSelected(current.mutedTypes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, groupId, currentKey]);

  const save = async (muteType: MuteRequest, chosen: MuteKind[], { withUndo = true } = {}) => {
    if (!groupId) return;
    const previousUser = queryClient.getQueryData<User>(['currentUser']);
    const previousState = muteStateFor(previousUser, groupId);
    // In a DM only chat can be chosen, but a DM mute covers everything (as before).
    const kindsToSend = isDM && muteType !== 'none' ? ALL : chosen;
    // Stop an earlier save's refetch from landing after this optimistic update.
    await queryClient.cancelQueries({ queryKey: ['currentUser'] });
    queryClient.setQueryData<User>(['currentUser'], (old) => (old ? applyMuteLocally(old, groupId, muteType, kindsToSend) : old));
    try {
      await userApi.toggleGroupMute(api, groupId, muteType, muteType === 'none' ? undefined : kindsToSend);
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      if (!withUndo) return;
      const undo = restoreRequest(previousState);
      if (muteType === 'none' || kindsToSend.length === 0) {
        toast.success('Notifications back on', { actionLabel: 'Undo', onAction: () => save(undo.muteType, undo.kinds, { withUndo: false }) });
      } else {
        toast.show({
          message: isDM ? describeMute(muteType, ALL) : describeMute(muteType, kindsToSend),
          kind: 'success',
          actionLabel: 'Undo',
          onAction: () => save(undo.muteType, undo.kinds, { withUndo: false }),
        });
      }
    } catch {
      if (previousUser) queryClient.setQueryData<User>(['currentUser'], previousUser);
      toast.error("Couldn't change notifications. Try again.");
    }
  };

  const choose = (muteType: Exclude<MuteRequest, 'none'>) => {
    haptic.press();
    onClose();
    save(muteType, selected);
  };

  const unmuteAll = () => {
    haptic.press();
    onClose();
    save('none', []);
  };

  const toggleKind = (key: MuteKind, on: boolean) => {
    haptic.select();
    touched.current = true;
    setSelected((prev) => (on ? ALL.filter((k) => k === key || prev.includes(k)) : prev.filter((k) => k !== key)));
  };

  const allOn = kinds.every((k) => selected.includes(k.key));
  const nothingChosen = selected.length === 0;

  // Same pastel chips and text colours the chat screen uses.
  const mutedChip = { backgroundColor: isDark ? '#3B1E1E' : '#FEF2F2', borderColor: isDark ? '#5C2E2E' : '#FECACA' };
  const untilNextChip = { backgroundColor: isDark ? '#3A2E12' : '#FFFBEB', borderColor: isDark ? '#5C4A1E' : '#FDE68A' };
  const activeChip = { backgroundColor: isDark ? '#132A1E' : '#F0FDF4', borderColor: isDark ? '#1F4A34' : '#BBF7D0' };
  const amberText = isDark ? '#FBBF24' : '#B45309';
  const redText = isDark ? '#F87171' : '#DC2626';
  const greenText = isDark ? '#4ADE80' : '#15803D';

  const isCurrent = (until: 'nextMeetup' | 'indefinite') => current.state !== 'none' && current.until === until;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.panel, { backgroundColor: colors.surface }]} onPress={() => {}}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Mute Notifications</Text>
          {!!group?.name && (
            <Text style={[styles.subtitle, { color: colors.textFaint }]} numberOfLines={1}>{group.name}</Text>
          )}

          {!isDM && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>WHAT TO MUTE</Text>
                <PressableOpacity
                  onPress={() => { haptic.select(); touched.current = true; setSelected(allOn ? [] : ALL); }}
                  hitSlop={8}
                  accessibilityLabel={allOn ? 'Turn all off' : 'Turn all on'}
                >
                  <Text style={[styles.allToggle, { color: colors.brand }]}>{allOn ? 'None' : 'All'}</Text>
                </PressableOpacity>
              </View>
              <ScrollView style={[styles.kindList, { borderColor: colors.border }]} bounces={false}>
                {kinds.map((k, i) => {
                  const on = selected.includes(k.key);
                  return (
                    <View
                      key={k.key}
                      style={[styles.kindRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                      accessibilityHint={k.hint}
                    >
                      <Feather name={k.icon as React.ComponentProps<typeof Feather>['name']} size={16} color={on ? colors.textSecondary : colors.textFaint} />
                      <Text style={[styles.kindLabel, { color: on ? colors.textPrimary : colors.textFaint }]}>{k.label}</Text>
                      <ToggleSwitch
                        value={on}
                        onValueChange={(v) => toggleKind(k.key, v)}
                        activeColor={redText}
                        accessibilityLabel={`Mute ${k.label}`}
                      />
                    </View>
                  );
                })}
              </ScrollView>
              {nothingChosen && (
                <Text style={[styles.helper, { color: colors.textFaint }]}>Turn on at least one to mute.</Text>
              )}
            </>
          )}

          <PressableOpacity
            style={[styles.option, untilNextChip, nothingChosen && styles.disabled]}
            onPress={() => choose('untilNext')}
            disabled={nothingChosen}
            activeOpacity={0.7}
            accessibilityState={{ disabled: nothingChosen, selected: isCurrent('nextMeetup') }}
          >
            <View style={[styles.iconWrap, { backgroundColor: isDark ? '#4A3A18' : '#FEF3C7' }]}>
              <Feather name="clock" size={18} color="#D97706" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.optionText, { color: amberText }]}>Mute until next meetup</Text>
              <Text style={[styles.optionSubtitle, { color: colors.textFaint }]}>We'll turn notifications back on for you</Text>
            </View>
            <Feather name={isCurrent('nextMeetup') ? 'check' : 'chevron-right'} size={18} color={isCurrent('nextMeetup') ? amberText : colors.textFaint} />
          </PressableOpacity>

          <PressableOpacity
            style={[styles.option, mutedChip, nothingChosen && styles.disabled]}
            onPress={() => choose('indefinite')}
            disabled={nothingChosen}
            activeOpacity={0.7}
            accessibilityState={{ disabled: nothingChosen, selected: isCurrent('indefinite') }}
          >
            <View style={[styles.iconWrap, { backgroundColor: isDark ? '#4A2424' : '#FEE2E2' }]}>
              <Feather name="bell-off" size={18} color="#DC2626" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.optionText, { color: redText }]}>Mute</Text>
              <Text style={[styles.optionSubtitle, { color: colors.textFaint }]}>Stay silent until you turn it back on</Text>
            </View>
            <Feather name={isCurrent('indefinite') ? 'check' : 'chevron-right'} size={18} color={isCurrent('indefinite') ? redText : colors.textFaint} />
          </PressableOpacity>

          {current.state !== 'none' && (
            <PressableOpacity style={[styles.option, activeChip]} onPress={unmuteAll} activeOpacity={0.7}>
              <View style={[styles.iconWrap, { backgroundColor: isDark ? '#1F4A34' : '#DCFCE7' }]}>
                <Feather name="bell" size={18} color={greenText} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionText, { color: greenText }]}>Unmute all</Text>
                <Text style={[styles.optionSubtitle, { color: colors.textFaint }]}>Get every notification from this group</Text>
              </View>
            </PressableOpacity>
          )}

          <PressableOpacity style={[styles.cancelBtn, { backgroundColor: colors.backgroundAlt }]} onPress={onClose}>
            <Text style={[styles.cancelText, { color: colors.textMuted }]}>Cancel</Text>
          </PressableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  panel: { borderRadius: 16, padding: 20, width: '100%', maxWidth: 360, maxHeight: '90%', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 },
  title: { fontSize: 16, fontWeight: '900' },
  subtitle: { fontSize: 13, fontWeight: '500', marginTop: 2 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 6 },
  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  allToggle: { fontSize: 13, fontWeight: '700' },
  kindList: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, flexGrow: 0, maxHeight: 340 },
  kindRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 12 },
  kindLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
  helper: { fontSize: 12, marginTop: 6 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1.5, marginTop: 10 },
  disabled: { opacity: 0.45 },
  iconWrap: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  optionText: { fontSize: 15, fontWeight: '800' },
  optionSubtitle: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 11, borderRadius: 10, marginTop: 14 },
  cancelText: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
});
