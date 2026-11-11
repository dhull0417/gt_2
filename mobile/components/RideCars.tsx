// The cars on a meetup: each driver with one line per person riding with them (riders and each
// guest), then everyone who still needs a ride. Owners/moderators can auto-assign; tapping a line
// offers whatever the viewer may do with that person. See utils/rides.ts.
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import OptionPickerModal from '@/components/OptionPickerModal';
import { useApiClient, meetupApi, Meetup, RideAssignmentBody } from '@/utils/api';
import { buildCars, lineActions, canAutoAssign, pickerOptionsFor, resolvePick, autoAssignMessage, PersonLine } from '@/utils/rides';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { useToast } from '@/contexts/ToastContext';
import { haptic } from '@/utils/haptics';
import type { ThemeColors } from '@/constants/theme';

interface Props {
  meetup: Meetup;
  currentUserId: string;
  /** Owner or moderator of the group. */
  canManage: boolean;
  onUpdated: (meetup: Meetup) => void;
  onStale?: () => void;
  /** Past or cancelled meetup: show the cars, change nothing. */
  readOnly?: boolean;
}

export default function RideCars({ meetup, currentUserId, canManage, onUpdated, onStale, readOnly = false }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const api = useApiClient();
  const toast = useToast();
  const [picker, setPicker] = useState<PersonLine | null>(null);
  const [busy, setBusy] = useState(false);

  const { cars, waiting } = buildCars(meetup, currentUserId);
  const actions = (line: PersonLine) => lineActions({ meetup, me: currentUserId, isManager: canManage, line });
  const actionable = (line: PersonLine) => {
    if (readOnly) return false;
    const a = actions(line);
    return a.targets.length > 0 || a.canRemove;
  };

  const send = async (body: RideAssignmentBody) => {
    setBusy(true);
    try {
      const result = await meetupApi.assignRide(api, meetup._id, body);
      haptic.success();
      if (result.meetup) onUpdated(result.meetup);
    } catch (err: any) {
      haptic.error();
      const data = err.response?.data;
      toast.error(data?.message || "Couldn't change that ride. Please try again.");
      if (err.response?.status === 409) onStale?.();
    } finally {
      setBusy(false);
    }
  };

  const autoAssign = async () => {
    setBusy(true);
    try {
      const result = await meetupApi.autoAssignRides(api, meetup._id);
      haptic.success();
      if (result.meetup) onUpdated(result.meetup);
      toast.success(autoAssignMessage(result.placed, result.unplaced));
    } catch (err: any) {
      haptic.error();
      toast.error(err.response?.data?.message || "Couldn't auto-assign rides. Please try again.");
      if (err.response?.status === 409) onStale?.();
    } finally {
      setBusy(false);
    }
  };

  const onPick = (key: string) => {
    const line = picker;
    setPicker(null);
    if (!line) return;
    const pick = resolvePick({ meetup, me: currentUserId, line, key });
    if (pick.kind === 'send') return send(pick.body);
    Alert.alert(pick.title, pick.message, [
      { text: "Don't join", style: 'cancel' },
      { text: 'Join anyway', onPress: () => send(pick.body) },
    ]);
  };

  const pickerOptions = picker ? pickerOptionsFor({ meetup, me: currentUserId, isManager: canManage, line: picker }) : [];

  const renderLine = (line: PersonLine) => {
    const can = actionable(line);
    return (
      <PressableOpacity
        key={line.key}
        disabled={!can || busy}
        onPress={() => { haptic.select(); setPicker(line); }}
        accessibilityLabel={can ? `${line.label}, change ride` : line.label}
        style={[styles.personRow, line.isMine && styles.personMine]}
      >
        <Feather name={line.isGuest ? 'user-plus' : 'user'} size={14} color={line.isMine ? colors.brand : colors.textMuted} />
        <Text style={[styles.personText, line.isMine && { color: colors.brand, fontWeight: '700' }]} numberOfLines={1}>{line.label}</Text>
        {can && <Feather name="chevron-right" size={16} color={colors.textFaint} />}
      </PressableOpacity>
    );
  };

  const iAmWaiting = waiting.some((l) => l.isMine && !l.isGuest);

  return (
    <View>
      {!readOnly && canAutoAssign(meetup, canManage) && (
        <PressableOpacity onPress={autoAssign} disabled={busy} style={styles.autoBtn} accessibilityLabel="Auto-assign rides">
          {busy ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="shuffle" size={16} color="#fff" />}
          <Text style={styles.autoText}>Auto-assign rides</Text>
        </PressableOpacity>
      )}

      {cars.map((car) => (
        <View key={car.driverId} style={[styles.car, car.isMine && { borderColor: colors.brand }]}>
          <View style={styles.carHeader}>
            <Feather name="truck" size={15} color={colors.accentTeal} />
            <Text style={styles.carName} numberOfLines={1}>{car.isMine ? 'You (driving)' : car.name}</Text>
            <Text style={[styles.carOpen, car.open === 0 && { color: colors.textFaint }]}>
              {car.open === 0 ? 'Full' : `${car.open} open`}
            </Text>
          </View>
          {car.lines.length === 0
            ? <Text style={styles.empty}>No riders yet</Text>
            : car.lines.map(renderLine)}
        </View>
      ))}

      {waiting.length > 0 && (
        <View style={{ marginTop: 6 }}>
          <Text style={styles.waitLabel}>Still needs a ride</Text>
          {waiting.map(renderLine)}
          {!readOnly && iAmWaiting && cars.some((c) => c.open > 0) && <Text style={styles.hint}>Tap your name to pick a car.</Text>}
        </View>
      )}

      {picker && (
        <OptionPickerModal
          title={picker.label}
          options={pickerOptions}
          selectedKey=""
          onSelect={onPick}
          onClose={() => setPicker(null)}
        />
      )}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  autoBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.accentTeal, borderRadius: 12, height: 44, marginBottom: 10 },
  autoText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  car: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 8, backgroundColor: colors.surfaceAlt },
  carHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  carName: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  carOpen: { fontSize: 13, fontWeight: '700', color: colors.accentTeal },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36, paddingHorizontal: 6, borderRadius: 8 },
  personMine: { backgroundColor: colors.brandSoft },
  personText: { flex: 1, fontSize: 14, color: colors.textSecondary },
  empty: { fontSize: 13, color: colors.textFaint, paddingVertical: 6, paddingHorizontal: 6 },
  waitLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted, marginBottom: 4 },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: 4, paddingHorizontal: 6 },
});
