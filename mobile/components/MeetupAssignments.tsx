import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Modal, ScrollView, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useApiClient, meetupApi, Meetup } from '@/utils/api';
import { assignmentsActive, summarizeAssignments, memberName } from '@/utils/assignments';
import { useThemeColors } from '@/contexts/AppearanceContext';
import type { ThemeColors } from '@/constants/theme';

interface Props {
  meetup: Meetup;
  currentUserId: string;
  /** Whether the current user is "I'm In" (assignments are only for people who are going). */
  isIn: boolean;
  /** Bump to open the sheet (e.g. right after the user RSVPs "I'm In"). */
  openSignal?: number;
  /** Called with the server's updated meetup after a save. */
  onUpdated: (meetup: Meetup) => void;
  /** Called when a save failed because the data was out of date (e.g. an item was just taken). */
  onStale?: () => void;
  /** Called whenever the assignments sheet closes (saved or dismissed). */
  onSheetClosed?: () => void;
}

export default function MeetupAssignments({ meetup, currentUserId, isIn, openSignal = 0, onUpdated, onStale, onSheetClosed }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (openSignal > 0 && isIn && assignmentsActive(meetup)) setSheetOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSignal]);

  if (!assignmentsActive(meetup)) return null;

  const summary = summarizeAssignments(meetup);
  const myClaims = summary.items.filter((i) => i.claimedBy.includes(currentUserId));
  const myRide = (meetup.rides ?? []).find((r) => r.user === currentUserId);
  const hasChoices = myClaims.length > 0 || !!myRide;
  const names = (ids: string[]) => ids.map((id) => (id === currentUserId ? 'You' : memberName(meetup, id))).join(', ');

  return (
    <Animated.View layout={LinearTransition.duration(260)} style={[styles.card, { overflow: 'hidden' }]}>
      <View style={styles.headerRow}>
        <PressableOpacity
          onPress={() => setCollapsed((c) => !c)}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 0, right: 8 }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}
        >
          <Feather name={collapsed ? 'chevron-right' : 'chevron-down'} size={16} color={colors.textFaint} />
          <Text style={styles.title}>Assignments</Text>
        </PressableOpacity>
        {isIn && (
          <PressableOpacity onPress={() => setSheetOpen(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.action}>{hasChoices ? 'Edit mine' : 'Choose'}</Text>
          </PressableOpacity>
        )}
      </View>

      {!collapsed && summary.items.length > 0 && (
        <Animated.View
          entering={FadeIn.duration(200).delay(120)}
          exiting={FadeOut.duration(100)}
          style={{ marginTop: 10 }}
        >
          <Text style={styles.sectionLabel}>Bringing</Text>
          {summary.items.map((item) => (
            <View key={item._id} style={styles.itemRow}>
              <Text style={[styles.itemName, item.isFull && { color: colors.textMuted }]}>
                {item.name}
                {item.max !== null ? `  ${item.claimedBy.length}/${item.max}` : ''}
              </Text>
              <Text style={styles.itemWho} numberOfLines={2}>
                {item.claimedBy.length > 0 ? names(item.claimedBy) : item.max !== null ? 'Needed' : '—'}
              </Text>
            </View>
          ))}
        </Animated.View>
      )}

      {!collapsed && meetup.ridesEnabled && (
        <Animated.View
          entering={FadeIn.duration(200).delay(120)}
          exiting={FadeOut.duration(100)}
          style={{ marginTop: 12 }}
        >
          <Text style={styles.sectionLabel}>Rides</Text>
          <View
            style={[
              styles.seatPill,
              { backgroundColor: summary.seatBalance >= 0 ? 'rgba(5,150,105,0.14)' : 'rgba(234,88,12,0.14)' },
            ]}
          >
            <Feather
              name={summary.seatBalance >= 0 ? 'check-circle' : 'alert-circle'}
              size={14}
              color={summary.seatBalance >= 0 ? '#059669' : '#EA580C'}
            />
            <Text style={{ fontSize: 13, fontWeight: '700', color: summary.seatBalance >= 0 ? '#059669' : '#EA580C' }}>
              {summary.drivers.length === 0 && summary.passengers.length === 0
                ? 'No drivers or passengers yet'
                : summary.seatBalance >= 0
                  ? `${summary.seatBalance} seat${summary.seatBalance === 1 ? '' : 's'} available`
                  : `${-summary.seatBalance} more seat${summary.seatBalance === -1 ? '' : 's'} needed`}
            </Text>
          </View>
          {summary.drivers.map((d) => (
            <Text key={d.userId} style={styles.rideLine}>
              {d.userId === currentUserId ? 'You' : memberName(meetup, d.userId)} · driving · {d.seats} seat{d.seats === 1 ? '' : 's'}
            </Text>
          ))}
          {summary.passengers.length > 0 && (
            <Text style={styles.rideLine}>Needs a ride: {names(summary.passengers)}</Text>
          )}
        </Animated.View>
      )}

      <AssignmentsSheet
        visible={sheetOpen}
        meetup={meetup}
        currentUserId={currentUserId}
        onClose={() => { setSheetOpen(false); onSheetClosed?.(); }}
        onUpdated={onUpdated}
        onStale={onStale}
      />
    </Animated.View>
  );
}

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
  const needsRole = !!meetup.ridesEnabled && role === null;

  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const save = async () => {
    setSaving(true);
    try {
      const body: Parameters<typeof meetupApi.setAssignments>[2] = {};
      if (forUser) body.targetUserId = forUser.id;
      if (hasItems) body.bring = selected;
      if (meetup.ridesEnabled) body.ride = role === 'driver' ? { role: 'driver', seats } : role === 'passenger' ? { role: 'passenger' } : null;
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
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{forUser ? `${forUser.name}'s assignments` : meetup.name}</Text>
            <PressableOpacity accessibilityLabel="Close" onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={22} color={colors.textMuted} />
            </PressableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ paddingBottom: 8 }}>
            {hasItems && (
              <View>
                <Text style={styles.sheetSection}>{forUser ? `What is ${forUser.name} bringing?` : 'What are you bringing?'}</Text>
                {summary.items.map((item) => {
                  const mine = selected.includes(item._id);
                  const alreadyMine = item.claimedBy.includes(currentUserId);
                  // Others' claims fill the item; mine only counts if I keep it.
                  const takenByOthers = item.claimedBy.length - (alreadyMine ? 1 : 0);
                  const unavailable = item.max !== null && takenByOthers >= item.max && !mine;
                  return (
                    <PressableOpacity
                      key={item._id}
                      disabled={unavailable}
                      onPress={() => toggle(item._id)}
                      style={[styles.option, mine && styles.optionOn, unavailable && styles.optionOff]}
                    >
                      <Feather name={mine ? 'check-square' : 'square'} size={20} color={mine ? colors.accentTeal : unavailable ? colors.borderStrong : colors.textFaint} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.optionText, unavailable && { color: colors.textFaint }]}>{item.name}</Text>
                        {item.max !== null && (
                          <Text style={styles.optionSub}>
                            {unavailable ? 'Already taken' : `${Math.max(item.max - takenByOthers - (mine ? 1 : 0), 0)} of ${item.max} still needed`}
                          </Text>
                        )}
                      </View>
                    </PressableOpacity>
                  );
                })}
              </View>
            )}

            {meetup.ridesEnabled && (
              <View style={{ marginTop: hasItems ? 18 : 0 }}>
                <Text style={styles.sheetSection}>Getting there</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {(['driver', 'passenger'] as const).map((r) => (
                    <PressableOpacity
                      key={r}
                      onPress={() => setRole(r)}
                      style={[styles.roleBtn, role === r && styles.roleBtnOn]}
                    >
                      <Feather name={r === 'driver' ? 'truck' : 'user'} size={16} color={role === r ? '#fff' : colors.accentTeal} />
                      <Text style={[styles.roleText, role === r && { color: '#fff' }]}>{r === 'driver' ? (forUser ? 'Driving' : "I'm driving") : (forUser ? 'Needs a ride' : 'I need a ride')}</Text>
                    </PressableOpacity>
                  ))}
                </View>

                {role === 'driver' && (
                  <View style={{ alignItems: 'center', marginTop: 16 }}>
                    <Text style={styles.sheetHint}>{forUser ? 'How many passengers can they bring?' : 'How many passengers can you bring?'}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 10 }}>
                      <PressableOpacity accessibilityLabel="Decrease"
                        onPress={() => setSeats((n) => Math.max(0, n - 1))}
                        disabled={seats === 0}
                        style={[styles.stepBtn, seats === 0 && styles.stepBtnOff]}
                      >
                        <Feather name="minus" size={18} color={seats === 0 ? colors.borderStrong : colors.brand} />
                      </PressableOpacity>
                      <Text style={styles.seatCount}>{seats}</Text>
                      <PressableOpacity accessibilityLabel="Increase"
                        onPress={() => setSeats((n) => Math.min(20, n + 1))}
                        style={styles.stepBtn}
                      >
                        <Feather name="plus" size={18} color={colors.brand} />
                      </PressableOpacity>
                    </View>
                  </View>
                )}
              </View>
            )}
          </ScrollView>

          <PressableOpacity
            onPress={save}
            disabled={saving || needsRole}
            style={[styles.saveBtn, (saving || needsRole) && { opacity: 0.5 }]}
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
  card: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, marginTop: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 11, fontWeight: '800', color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.5 },
  action: { fontSize: 14, fontWeight: '700', color: colors.brand },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted, marginBottom: 6 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 5 },
  itemName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  itemWho: { fontSize: 14, color: colors.textMuted, flexShrink: 1, textAlign: 'right' },
  seatPill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 6 },
  rideLine: { fontSize: 14, color: colors.textSecondary, paddingVertical: 2 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 34 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.textPrimary, flex: 1, paddingRight: 12 },
  sheetSection: { fontSize: 13, fontWeight: '800', color: colors.textSecondary, marginBottom: 10 },
  sheetHint: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, marginBottom: 8 },
  optionOn: { borderColor: colors.accentTeal, backgroundColor: 'rgba(79,209,197,0.16)' },
  optionOff: { backgroundColor: colors.surfaceAlt },
  optionText: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  optionSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  roleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, borderColor: colors.accentTeal, backgroundColor: colors.surface },
  roleBtnOn: { backgroundColor: colors.accentTeal },
  roleText: { fontSize: 15, fontWeight: '700', color: colors.accentTeal },
  stepBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandSoft, borderWidth: 1.5, borderColor: '#93C5FD', alignItems: 'center', justifyContent: 'center' },
  stepBtnOff: { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
  seatCount: { fontSize: 28, fontWeight: '900', color: colors.textPrimary, minWidth: 36, textAlign: 'center' },
  saveBtn: { backgroundColor: colors.accentTeal, borderRadius: 14, alignItems: 'center', justifyContent: 'center', height: 52, marginTop: 16 },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
