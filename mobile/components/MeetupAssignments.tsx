import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useApiClient, meetupApi, Meetup } from '@/utils/api';
import { assignmentsActive, summarizeAssignments, memberName } from '@/utils/assignments';

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
}

export default function MeetupAssignments({ meetup, currentUserId, isIn, openSignal = 0, onUpdated, onStale }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);

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
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Assignments</Text>
        {isIn && (
          <TouchableOpacity onPress={() => setSheetOpen(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.action}>{hasChoices ? 'Edit mine' : 'Choose'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {summary.items.length > 0 && (
        <View style={{ marginTop: 10 }}>
          <Text style={styles.sectionLabel}>Bringing</Text>
          {summary.items.map((item) => (
            <View key={item._id} style={styles.itemRow}>
              <Text style={[styles.itemName, item.isFull && { color: '#6B7280' }]}>
                {item.name}
                {item.max !== null ? `  ${item.claimedBy.length}/${item.max}` : ''}
              </Text>
              <Text style={styles.itemWho} numberOfLines={2}>
                {item.claimedBy.length > 0 ? names(item.claimedBy) : item.max !== null ? 'Needed' : '—'}
              </Text>
            </View>
          ))}
        </View>
      )}

      {meetup.ridesEnabled && (
        <View style={{ marginTop: 12 }}>
          <Text style={styles.sectionLabel}>Rides</Text>
          <View
            style={[
              styles.seatPill,
              { backgroundColor: summary.seatBalance >= 0 ? '#ECFDF5' : '#FFF7ED' },
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
        </View>
      )}

      <AssignmentsSheet
        visible={sheetOpen}
        meetup={meetup}
        currentUserId={currentUserId}
        onClose={() => setSheetOpen(false)}
        onUpdated={onUpdated}
        onStale={onStale}
      />
    </View>
  );
}

function AssignmentsSheet({
  visible, meetup, currentUserId, onClose, onUpdated, onStale,
}: { visible: boolean; meetup: Meetup; currentUserId: string; onClose: () => void; onUpdated: (m: Meetup) => void; onStale?: () => void }) {
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
            <Text style={styles.sheetTitle}>{meetup.name}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={22} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ paddingBottom: 8 }}>
            {hasItems && (
              <View>
                <Text style={styles.sheetSection}>What are you bringing?</Text>
                {summary.items.map((item) => {
                  const mine = selected.includes(item._id);
                  const alreadyMine = item.claimedBy.includes(currentUserId);
                  // Others' claims fill the item; mine only counts if I keep it.
                  const takenByOthers = item.claimedBy.length - (alreadyMine ? 1 : 0);
                  const unavailable = item.max !== null && takenByOthers >= item.max && !mine;
                  return (
                    <TouchableOpacity
                      key={item._id}
                      disabled={unavailable}
                      onPress={() => toggle(item._id)}
                      style={[styles.option, mine && styles.optionOn, unavailable && styles.optionOff]}
                    >
                      <Feather name={mine ? 'check-square' : 'square'} size={20} color={mine ? '#4FD1C5' : unavailable ? '#D1D5DB' : '#9CA3AF'} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.optionText, unavailable && { color: '#9CA3AF' }]}>{item.name}</Text>
                        {item.max !== null && (
                          <Text style={styles.optionSub}>
                            {unavailable ? 'Already taken' : `${Math.max(item.max - takenByOthers - (mine ? 1 : 0), 0)} of ${item.max} still needed`}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {meetup.ridesEnabled && (
              <View style={{ marginTop: hasItems ? 18 : 0 }}>
                <Text style={styles.sheetSection}>Getting there</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {(['driver', 'passenger'] as const).map((r) => (
                    <TouchableOpacity
                      key={r}
                      onPress={() => setRole(r)}
                      style={[styles.roleBtn, role === r && styles.roleBtnOn]}
                    >
                      <Feather name={r === 'driver' ? 'truck' : 'user'} size={16} color={role === r ? '#fff' : '#4FD1C5'} />
                      <Text style={[styles.roleText, role === r && { color: '#fff' }]}>{r === 'driver' ? "I'm driving" : 'I need a ride'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {role === 'driver' && (
                  <View style={{ alignItems: 'center', marginTop: 16 }}>
                    <Text style={styles.sheetHint}>How many passengers can you bring?</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 10 }}>
                      <TouchableOpacity
                        onPress={() => setSeats((n) => Math.max(0, n - 1))}
                        disabled={seats === 0}
                        style={[styles.stepBtn, seats === 0 && styles.stepBtnOff]}
                      >
                        <Feather name="minus" size={18} color={seats === 0 ? '#D1D5DB' : '#4A90E2'} />
                      </TouchableOpacity>
                      <Text style={styles.seatCount}>{seats}</Text>
                      <TouchableOpacity
                        onPress={() => setSeats((n) => Math.min(20, n + 1))}
                        style={styles.stepBtn}
                      >
                        <Feather name="plus" size={18} color="#4A90E2" />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            )}
          </ScrollView>

          <TouchableOpacity
            onPress={save}
            disabled={saving || needsRole}
            style={[styles.saveBtn, (saving || needsRole) && { opacity: 0.5 }]}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={{ alignItems: 'center', paddingTop: 12 }}>
            <Text style={{ color: '#6B7280', fontWeight: '600' }}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', padding: 14, marginTop: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 11, fontWeight: '800', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 },
  action: { fontSize: 14, fontWeight: '700', color: '#4A90E2' },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#6B7280', marginBottom: 6 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 5 },
  itemName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  itemWho: { fontSize: 14, color: '#6B7280', flexShrink: 1, textAlign: 'right' },
  seatPill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 6 },
  rideLine: { fontSize: 14, color: '#4B5563', paddingVertical: 2 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 34 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: '#111827', flex: 1, paddingRight: 12 },
  sheetSection: { fontSize: 13, fontWeight: '800', color: '#374151', marginBottom: 10 },
  sheetHint: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', marginBottom: 8 },
  optionOn: { borderColor: '#4FD1C5', backgroundColor: '#F0FDFA' },
  optionOff: { backgroundColor: '#F9FAFB' },
  optionText: { fontSize: 16, fontWeight: '600', color: '#111827' },
  optionSub: { fontSize: 12, color: '#6B7280', marginTop: 1 },
  roleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, borderColor: '#4FD1C5', backgroundColor: '#fff' },
  roleBtnOn: { backgroundColor: '#4FD1C5' },
  roleText: { fontSize: 15, fontWeight: '700', color: '#4FD1C5' },
  stepBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EEF6FF', borderWidth: 1.5, borderColor: '#93C5FD', alignItems: 'center', justifyContent: 'center' },
  stepBtnOff: { backgroundColor: '#F9FAFB', borderColor: '#E5E7EB' },
  seatCount: { fontSize: 28, fontWeight: '900', color: '#111827', minWidth: 36, textAlign: 'center' },
  saveBtn: { backgroundColor: '#4FD1C5', borderRadius: 14, alignItems: 'center', justifyContent: 'center', height: 52, marginTop: 16 },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
