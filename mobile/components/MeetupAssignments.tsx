import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Modal, ScrollView, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useApiClient, meetupApi, Meetup } from '@/utils/api';
import { summarizeAssignments, rideBody } from '@/utils/assignments';
import { BringPicker } from '@/components/rsvp-confirm/BringPicker';
import { RidePicker } from '@/components/rsvp-confirm/RidePicker';
import { useThemeColors } from '@/contexts/AppearanceContext';
import type { ThemeColors } from '@/constants/theme';

/** Items to bring and ride for one person, saved together. Used by owners/moderators via
 *  "Edit Assignments"; members use the tabbed MeetupConfirmSheet. */
export function AssignmentsSheet({
  visible, meetup, currentUserId: viewerId, onClose, onUpdated, onStale, forUser,
}: {
  visible: boolean; meetup: Meetup; currentUserId: string; onClose: () => void;
  onUpdated: (m: Meetup) => void; onStale?: () => void;
  /** Owner/moderator filling this in on someone else's behalf. */
  forUser?: { id: string; name: string };
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // 3-button Android navigation is taller than the fixed 34pt pad, which hid the sheet's last row.
  const insets = useSafeAreaInsets();
  const currentUserId = forUser?.id ?? viewerId;
  const api = useApiClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [role, setRole] = useState<'driver' | 'passenger' | null>(null);
  const [seats, setSeats] = useState(0);
  const [saving, setSaving] = useState(false);

  // Start from the user's current choices each time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setSelected((meetup.bringClaims ?? []).filter((c) => c.user === currentUserId).map((c) => c.item));
    const mine = (meetup.rides ?? []).find((r) => r.user === currentUserId);
    setRole(mine?.role ?? null);
    setSeats(mine?.role === 'driver' ? mine.seats : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const summary = summarizeAssignments(meetup);
  const hasItems = summary.items.length > 0;

  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const save = async () => {
    setSaving(true);
    try {
      const body: Parameters<typeof meetupApi.setAssignments>[2] = {};
      if (forUser) body.targetUserId = forUser.id;
      if (hasItems) body.bring = selected;
      if (meetup.ridesEnabled) body.ride = rideBody(role, seats);
      const result = await meetupApi.setAssignments(api, meetup._id, body);
      if (result.meetup) onUpdated(result.meetup);
      onClose();
    } catch (err: any) {
      const data = err.response?.data;
      Alert.alert(data?.error === 'item_full' ? 'Already taken' : 'Could not save', data?.message || data?.error || 'Please try again.');
      // Pull the latest so the full item shows as taken.
      if (data?.error === 'item_full') onStale?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: Math.max(34, insets.bottom + 16) }]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{forUser ? `${forUser.name}'s assignments` : meetup.name}</Text>
            <PressableOpacity accessibilityLabel="Close" onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={22} color={colors.textMuted} />
            </PressableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ paddingBottom: 8 }}>
            {hasItems && (
              <BringPicker
                meetup={meetup}
                userId={currentUserId}
                selected={selected}
                onToggle={toggle}
                title={forUser ? `What is ${forUser.name} bringing?` : 'What are you bringing?'}
              />
            )}

            {meetup.ridesEnabled && (
              <View style={{ marginTop: hasItems ? 18 : 0 }}>
                <RidePicker role={role} seats={seats} onRole={setRole} onSeats={setSeats} forName={forUser?.name} />
              </View>
            )}
          </ScrollView>

          <PressableOpacity
            onPress={save}
            disabled={saving}
            style={[styles.saveBtn, saving && { opacity: 0.5 }]}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save</Text>}
          </PressableOpacity>
          <PressableOpacity onPress={onClose} style={{ alignItems: 'center', paddingTop: 12 }}>
            <Text style={{ color: colors.textMuted, fontWeight: '600' }}>Not now</Text>
          </PressableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 34 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.textPrimary, flex: 1, paddingRight: 12 },
  saveBtn: { backgroundColor: colors.accentTeal, borderRadius: 14, alignItems: 'center', justifyContent: 'center', height: 52, marginTop: 16 },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
