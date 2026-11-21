import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import type { Meetup } from '@/utils/api';
import { nextRole, type RideRole } from '@/utils/assignments';
import { buildCars, ridersOf } from '@/utils/rides';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { makePickerStyles } from './styles';

/** Driving or needing a ride; a driver also sets how many passengers they can take. */
export function RidePicker({ role, seats, onRole, onSeats, forName }: {
  role: RideRole | null;
  seats: number;
  onRole: (role: RideRole | null) => void;
  onSeats: (seats: number) => void;
  /** Set when an owner/moderator fills this in for someone else (changes the wording). */
  forName?: string;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => makePickerStyles(colors), [colors]);
  return (
    <View>
      <Text style={styles.section}>Getting there</Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {(['driver', 'passenger'] as const).map((r) => (
          <PressableOpacity
            key={r}
            onPress={() => onRole(nextRole(role, r))}
            style={[styles.roleBtn, role === r && styles.roleBtnOn]}
          >
            <Feather name={r === 'driver' ? 'truck' : 'user'} size={16} color={role === r ? '#fff' : colors.accentTeal} />
            <Text style={[styles.roleText, role === r && { color: '#fff' }]}>
              {r === 'driver' ? (forName ? 'Driving' : "I'm driving") : (forName ? 'Needs a ride' : 'I need a ride')}
            </Text>
          </PressableOpacity>
        ))}
      </View>

      {role === 'driver' && (
        <View style={{ alignItems: 'center', marginTop: 16 }}>
          <Text style={styles.hint}>{forName ? 'How many passengers can they bring?' : 'How many passengers can you bring?'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 10 }}>
            <PressableOpacity
              accessibilityLabel="Decrease"
              onPress={() => onSeats(Math.max(0, seats - 1))}
              disabled={seats === 0}
              style={[styles.stepBtn, seats === 0 && styles.stepBtnOff]}
            >
              <Feather name="minus" size={18} color={seats === 0 ? colors.borderStrong : colors.brand} />
            </PressableOpacity>
            <Text style={styles.seatCount}>{seats}</Text>
            <PressableOpacity accessibilityLabel="Increase" onPress={() => onSeats(Math.min(20, seats + 1))} style={styles.stepBtn}>
              <Feather name="plus" size={18} color={colors.brand} />
            </PressableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

/** Read-only: someone's ride — driving (with who's riding along), riding with someone, or needing one. */
export function RideReview({ meetup, userId, viewerId }: { meetup: Meetup; userId: string; viewerId: string }) {
  const colors = useThemeColors();
  const styles = useMemo(() => makePickerStyles(colors), [colors]);
  const ride = (meetup.rides ?? []).find((r) => r.user === userId);
  if (!ride) {
    return <Text style={styles.empty}>{userId === viewerId ? "You haven't picked a ride yet." : 'No ride picked yet.'}</Text>;
  }
  if (ride.role === 'driver') {
    const riders = ridersOf(meetup, userId, viewerId);
    return (
      <View>
        <View style={[styles.option, styles.optionOn]}>
          <Feather name="truck" size={20} color={colors.accentTeal} />
          <Text style={styles.optionText}>Driving · {ride.seats} seat{ride.seats === 1 ? '' : 's'}</Text>
        </View>
        <Text style={styles.hint}>{riders.length === 0 ? 'No riders yet' : `Riding along: ${riders.map((r) => r.label).join(', ')}`}</Text>
      </View>
    );
  }
  const car = buildCars(meetup, viewerId).cars.find((c) => c.lines.some((l) => l.riderId === userId && !l.isGuest));
  return (
    <View style={[styles.option, styles.optionOn]}>
      <Feather name="user" size={20} color={colors.accentTeal} />
      <Text style={styles.optionText}>{car ? `Riding with ${car.driverId === viewerId ? 'you' : car.name}` : 'Needs a ride'}</Text>
    </View>
  );
}
