import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import type { Meetup } from '@/utils/api';
import { summarizeAssignments } from '@/utils/assignments';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { makePickerStyles } from './styles';

/** The "Stuff to bring" checklist. Full items (taken by others) can't be picked. */
export function BringPicker({ meetup, userId, selected, onToggle, title = 'What are you bringing?' }: {
  meetup: Meetup;
  /** Whose picks these are (yours, or the member an owner is filling in for). */
  userId: string;
  selected: string[];
  onToggle: (itemId: string) => void;
  title?: string;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => makePickerStyles(colors), [colors]);
  return (
    <View>
      <Text style={styles.section}>{title}</Text>
      {summarizeAssignments(meetup).items.map((item) => {
        const mine = selected.includes(item._id);
        const alreadyMine = item.claimedBy.includes(userId);
        // Others' claims fill the item; mine only counts if I keep it.
        const takenByOthers = item.claimedBy.length - (alreadyMine ? 1 : 0);
        const unavailable = item.max !== null && takenByOthers >= item.max && !mine;
        return (
          <PressableOpacity
            key={item._id}
            disabled={unavailable}
            onPress={() => onToggle(item._id)}
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
  );
}

/** Read-only: what someone has signed up to bring. */
export function BringReview({ meetup, userId, isSelf }: { meetup: Meetup; userId: string; isSelf: boolean }) {
  const colors = useThemeColors();
  const styles = useMemo(() => makePickerStyles(colors), [colors]);
  const items = summarizeAssignments(meetup).items.filter((i) => i.claimedBy.includes(userId));
  if (items.length === 0) {
    return <Text style={styles.empty}>{isSelf ? "You're not bringing anything yet." : 'Not bringing anything yet.'}</Text>;
  }
  return (
    <View>
      {items.map((item) => (
        <View key={item._id} style={[styles.option, styles.optionOn]}>
          <Feather name="check-square" size={20} color={colors.accentTeal} />
          <Text style={styles.optionText}>{item.name}</Text>
        </View>
      ))}
    </View>
  );
}
