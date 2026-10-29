import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { Feather, MaterialIcons, Ionicons } from '@expo/vector-icons';
import ReanimatedAnimated from 'react-native-reanimated';
import { Meetup, User } from '@/utils/api';
import { GroupAvatar } from '@/components/GroupAvatar';
import { RsvpBreather } from '@/components/RsvpBreather';
import { getMeetupStatus, isRsvpDeadlinePassed as isRsvpDeadlinePassedFn, isRsvpLockedFor, describeRsvpOpensFor, canPriorityBump } from '@/utils/meetupStatus';
import { useAppearance, useThemeColors } from '@/contexts/AppearanceContext';
import type { ThemeColors } from '@/constants/theme';

const getUserId = (u: User | string): string => typeof u === 'string' ? u : u._id;

const formatDate = (dateString: string, timezone: string) => {
    const date = new Date(dateString);
    const dateYear = Number(date.toLocaleDateString('en-CA', { timeZone: timezone }).slice(0, 4));
    const currentYear = new Date().getFullYear();
    const options: Intl.DateTimeFormatOptions = {
        weekday: 'long', month: 'long', day: 'numeric',
        year: dateYear !== currentYear ? 'numeric' : undefined,
        timeZone: timezone,
    };
    return date.toLocaleDateString(undefined, options);
};

const RsvpCounts = ({ meetup, colors }: { meetup: Meetup; colors: ThemeColors }) => {
    const totalGuests = (meetup.guests || []).reduce((sum, g) => sum + (g.count || 0), 0);
    const inCount = meetup.in.length + totalGuests;
    const spotsLeft = meetup.capacity > 0 ? Math.max(meetup.capacity - inCount, 0) : null;
    const minAttendees = meetup.minAttendees ?? 0;
    return (
      <>
        <View className="flex-row items-center justify-between mt-3 flex-wrap">
            <View className="flex-row items-center flex-wrap">
                <View className="flex-row items-center mr-4">
                    <View className="w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: colors.accentTeal }} />
                    <Text className="text-gray-600 dark:text-gray-300 font-medium">
                        {inCount} In
                    </Text>
                </View>

                <View className="flex-row items-center mr-4">
                    <View className="w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: colors.accentCoral }} />
                    <Text className="text-gray-600 dark:text-gray-300 font-medium">{meetup.out.length} Out</Text>
                </View>
            </View>

            {spotsLeft !== null && (
                <Text className="text-gray-400 dark:text-gray-500" style={{ fontSize: 13, fontStyle: 'italic' }}>
                    {spotsLeft} {spotsLeft === 1 ? 'spot' : 'spots'} left
                </Text>
            )}
        </View>
        {minAttendees > 0 && (
            <Text className="text-gray-400 mt-1" style={{ fontSize: 12 }}>
                {inCount >= minAttendees
                    ? `Minimum of ${minAttendees} met`
                    : `Needs ${minAttendees - inCount} more to go ahead (minimum ${minAttendees})`}
            </Text>
        )}
      </>
    );
};

export const MeetupCard = ({
  meetup,
  onPress,
  showRsvpButtons,
  onRsvp,
  isRsvping,
  currentUser,
}: {
  meetup: Meetup;
  onPress: () => void;
  showRsvpButtons: boolean;
  onRsvp: (status: 'in' | 'out', guestCount?: number, mute?: boolean) => void;
  isRsvping: boolean;
  currentUser: User | undefined;
}) => {
  const { scheme } = useAppearance();
  const colors = useThemeColors();
  const [guestExpanded, setGuestExpanded] = useState(false);
  const [localGuestCount, setLocalGuestCount] = useState(() => {
    const entry = meetup.guests?.find(g => g.userId === currentUser?.clerkId);
    return entry?.count ?? 0;
  });

  useEffect(() => {
    if (!guestExpanded) {
      const entry = meetup.guests?.find(g => g.userId === currentUser?.clerkId);
      setLocalGuestCount(entry?.count ?? 0);
    }
  }, [meetup.guests, currentUser?.clerkId, guestExpanded]);

  const { isCancelled, isExpired, isHappeningNow } = getMeetupStatus(meetup);
  const isRsvpLocked = isRsvpLockedFor(meetup, currentUser?._id);
  const isRsvpDeadlinePassed = isRsvpDeadlinePassedFn(meetup);

  const isFull = meetup.capacity > 0 && meetup.in.length >= meetup.capacity;
  const isWaitlisted = currentUser ? meetup.waitlist.some(u => getUserId(u) === currentUser._id) : false;
  const isIn = currentUser ? meetup.in.some(u => getUserId(u) === currentUser._id) : false;
  const isOut = currentUser ? meetup.out.some(u => getUserId(u) === currentUser._id) : false;
  // Waitlists are a Premium feature of the group owner: on a full meetup in a
  // non-Premium group there is nothing to join, so the button reads "Full".
  // (Only `=== false` counts, so a missing flag never blocks; the server enforces.)
  const waitlistLocked = isFull && !isIn && !isWaitlisted && (meetup.group?.waitlistEnabled ?? meetup.group?.isPremium) === false;
  const canBump = canPriorityBump(meetup, currentUser?._id);
  const inUnselected = !isIn && !isWaitlisted && !(isFull && !isIn);
  const outUnselected = !isOut;
  const isUndecided = inUnselected && outUnselected;
  // While undecided, fill both buttons like they're selected so neither reads as the "default" choice.
  const inFilled = !inUnselected || isUndecided;
  const outFilled = !outUnselected || isUndecided;

  const isReadOnly = isCancelled || isExpired;
  const hasRsvpResponse = isIn || isOut || isWaitlisted;

  // Tint matches detail modal: amber until responded, green (in), blue (waitlisted), red (out).
  // Light mode uses soft pastel fills; dark mode swaps in muted, low-saturation versions of the
  // same hues so the card still reads as "tinted" without turning into a bright patch on a dark screen.
  const rsvpBackgroundColor = scheme === 'dark'
    ? (isOut ? '#3A1F1F' : isWaitlisted ? '#1B2A3C' : isIn ? '#16261D' : colors.surfaceAlt)
    : (isOut ? '#FEF2F2' : isWaitlisted ? '#EFF6FF' : isIn ? '#EDF5F0' : '#FFFEFA');

  return (
    <View
      className={`p-5 my-2 rounded-2xl shadow-sm border relative ${
        isCancelled ? 'bg-red-50/30 dark:bg-red-900/20 border-red-100 dark:border-red-900 opacity-80' :
        isExpired ? 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700' : 'border-gray-200 dark:border-gray-700'
      }`}
      style={{
        ...(isExpired && !isCancelled ? { opacity: 0.75 } : {}),
        ...(!isReadOnly ? { backgroundColor: rsvpBackgroundColor } : {}),
      }}
    >
      <PressableOpacity onPress={onPress}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ marginRight: 12 }}>
            <GroupAvatar name={meetup.group.name} imageUrl={meetup.group.image} size={44} borderRadius={12} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 1 }}>
              {meetup.time}
            </Text>

            <View className="flex-row justify-between items-start" style={{ marginTop: 4 }}>
              <View className="flex-1 pr-6">
                <Text
                  style={{
                    fontSize: 20,
                    fontWeight: 'bold',
                    color: isReadOnly ? colors.textFaint : colors.accentTeal,
                    textDecorationLine: isCancelled ? 'line-through' : 'none'
                  }}
                >
                  {meetup.name}
                </Text>
              </View>
              {!isReadOnly && (
                isIn || isOut ? (
                  <Text style={{ fontSize: 13, fontWeight: '900', letterSpacing: 1, color: isIn ? colors.accentTeal : colors.accentCoral }}>
                    {isIn ? 'IN' : 'OUT'}
                  </Text>
                ) : isRsvpLocked ? (
                  <Feather name="clock" size={20} color={colors.textFaint} />
                ) : isRsvpDeadlinePassed ? (
                  <Feather name="lock" size={20} color={colors.textFaint} />
                ) : (
                  <Ionicons name="mail-open-outline" size={20} color={colors.warning} />
                )
              )}
            </View>
          </View>
        </View>

        <View style={{ marginLeft: 56, marginTop: 4 }}>
          {isCancelled && (
            <View className="bg-red-100 dark:bg-red-900 self-start px-2 py-0.5 rounded-md mt-1">
              <Text className="text-red-600 dark:text-red-200 text-[10px] font-black uppercase">Cancelled</Text>
            </View>
          )}
          {isCancelled && meetup.cancelReason === 'minimum-headcount' && (
            <Text className="text-gray-500 mt-1" style={{ fontSize: 12 }}>RSVP deadline passed; minimum headcount wasn't met</Text>
          )}
          {isExpired && !isCancelled && (
            <View className="bg-gray-300 dark:bg-gray-700 self-start px-2 py-0.5 rounded-md mt-1">
              <Text className="text-gray-700 dark:text-gray-200 text-[10px] font-black uppercase">Past Event</Text>
            </View>
          )}
          {isHappeningNow && (
            <View className="bg-teal-100 dark:bg-teal-900 self-start px-2 py-0.5 rounded-md mt-1">
              <Text className="text-teal-700 dark:text-teal-200 text-[10px] font-black uppercase">Happening Now</Text>
            </View>
          )}
          {!!meetup.description?.trim() && (
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={{ fontSize: 13, color: colors.textFaint, marginTop: 4 }}
            >
              {meetup.description.trim()}
            </Text>
          )}

          {!isReadOnly && <RsvpCounts meetup={meetup} colors={colors} />}

          <View className="flex-row mt-2">
              {isFull && !isReadOnly && !isIn && (
                  <View className="bg-orange-100 dark:bg-orange-900 px-2 py-1 rounded-lg mr-2 border border-orange-200 dark:border-orange-700">
                      <Text className="text-orange-600 dark:text-orange-200 text-[10px] font-black">FULL</Text>
                  </View>
              )}
              {isWaitlisted && (
                  <View className="bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded-lg border border-blue-200 dark:border-blue-700">
                      <Text className="text-blue-600 dark:text-blue-200 text-[10px] font-black uppercase">Waitlisted</Text>
                  </View>
              )}
          </View>

          {isExpired && !isCancelled && (
            <View className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 flex-row items-center">
              <Feather name="info" size={12} color={colors.textFaint} />
              <Text style={{ color: colors.textFaint }} className="text-[11px] font-bold uppercase ml-1.5 tracking-tight">
                View History & Details
              </Text>
            </View>
          )}
        </View>
      </PressableOpacity>

      {showRsvpButtons && !isReadOnly && (isRsvpLocked || isRsvpDeadlinePassed || !hasRsvpResponse) && (
        <View className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
          {isRsvpLocked ? (
            <View className="bg-gray-100 dark:bg-gray-800 py-3 rounded-xl items-center border border-gray-200 dark:border-gray-700">
              <View className="flex-row items-center">
                <Feather name="lock" size={22} color={colors.textMuted} className="mr-2" />
                <Text className="text-gray-600 dark:text-gray-300 font-bold text-sm ml-1.5">
                  RSVPs open {describeRsvpOpensFor(meetup, currentUser?._id)}
                </Text>
              </View>
            </View>
          ) : isRsvpDeadlinePassed ? (
            <View className="bg-gray-100 dark:bg-gray-800 py-3 rounded-xl items-center border border-gray-200 dark:border-gray-700">
              <View className="flex-row items-center">
                <Feather name="lock" size={22} color={colors.textMuted} className="mr-2" />
                <Text className="text-gray-600 dark:text-gray-300 font-bold text-sm ml-1.5">
                  RSVP deadline passed on {formatDate(meetup.rsvpCloseDate!, meetup.timezone)}
                </Text>
              </View>
            </View>
          ) : (
            <>
              <RsvpBreather active={isUndecided}>
                {({ boxStyle, inTextStyle, outTextStyle }) => (
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    {/* Split I'm In button: left 70% = RSVP in, right 30% = open guest counter */}
                    <View style={{
                      flex: 1, borderRadius: 12, overflow: 'hidden', height: 48,
                      backgroundColor: isWaitlisted ? '#2563EB' : waitlistLocked ? '#9CA3AF' : (isFull && !isIn) ? (canBump ? colors.accentTeal : '#F97316') : inFilled ? colors.accentTeal : colors.surface,
                    }}>
                      <ReanimatedAnimated.View style={[{
                        flex: 1, flexDirection: 'row', borderRadius: 12,
                        borderWidth: inFilled ? 0 : 1.5,
                        borderColor: colors.accentTeal,
                      }, boxStyle]}>
                        <PressableOpacity
                          onPress={() => { setGuestExpanded(false); onRsvp('in', 0); }}
                          disabled={isRsvping || waitlistLocked}
                          style={{ flex: 7, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <ReanimatedAnimated.Text style={[{ color: inFilled ? 'white' : colors.accentTeal, fontWeight: 'bold', fontSize: 16 }, inTextStyle]}>
                            {isWaitlisted ? "Waitlisted" : waitlistLocked ? "Full" : (isFull && !isIn) ? (canBump ? "Priority In" : "Join Waitlist") : "I'm In"}
                          </ReanimatedAnimated.Text>
                        </PressableOpacity>
                        <View style={{ width: 1, backgroundColor: inFilled ? 'rgba(255,255,255,0.35)' : colors.border }} />
                        <PressableOpacity
                          onPress={() => { setLocalGuestCount(0); setGuestExpanded(v => !v); }}
                          disabled={isRsvping || waitlistLocked}
                          style={{ flex: 3, alignItems: 'center', justifyContent: 'center' }}
                        >
                          {guestExpanded
                            ? <Feather name="x" size={18} color={inFilled ? 'white' : colors.accentTeal} />
                            : <MaterialIcons name="group-add" size={20} color={inFilled ? 'white' : colors.accentTeal} />
                          }
                        </PressableOpacity>
                      </ReanimatedAnimated.View>
                    </View>
                    {/* Split I'm Out button: left 70% = RSVP out, right 30% = RSVP out + mute group */}
                    <View style={{
                      flex: 1, borderRadius: 12, overflow: 'hidden', height: 48,
                      backgroundColor: outFilled ? colors.accentCoral : colors.surface,
                    }}>
                      <ReanimatedAnimated.View style={[{
                        flex: 1, flexDirection: 'row', borderRadius: 12,
                        borderWidth: outFilled ? 0 : 1.5,
                        borderColor: colors.accentCoral,
                      }, boxStyle]}>
                        <PressableOpacity
                          onPress={() => { setGuestExpanded(false); onRsvp('out'); }}
                          disabled={isRsvping}
                          style={{ flex: 7, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <ReanimatedAnimated.Text style={[{ color: outFilled ? 'white' : colors.accentCoral, fontWeight: 'bold', fontSize: 16 }, outTextStyle]}>I'm Out</ReanimatedAnimated.Text>
                        </PressableOpacity>
                        <View style={{ width: 1, backgroundColor: outFilled ? 'rgba(255,255,255,0.35)' : colors.border }} />
                        <PressableOpacity
                          onPress={() => { setGuestExpanded(false); onRsvp('out', 0, true); }}
                          disabled={isRsvping}
                          style={{ flex: 3, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Feather name="bell-off" size={18} color={outFilled ? 'white' : colors.accentCoral} />
                        </PressableOpacity>
                      </ReanimatedAnimated.View>
                    </View>
                  </View>
                )}
              </RsvpBreather>

              {/* Inline guest counter — expands below buttons when + is tapped */}
              {guestExpanded && (
                <View style={{ alignItems: 'center', marginTop: 10 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Add Guests?</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
                  <PressableOpacity accessibilityLabel="Decrease"
                    onPress={() => setLocalGuestCount(c => Math.max(0, c - 1))}
                    disabled={localGuestCount === 0}
                    style={{
                      width: 36, height: 36, borderRadius: 18,
                      backgroundColor: localGuestCount === 0 ? colors.surfaceAlt : colors.brandSoft,
                      borderWidth: 1.5,
                      borderColor: localGuestCount === 0 ? colors.border : colors.brand,
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Feather name="minus" size={16} color={localGuestCount === 0 ? colors.borderStrong : colors.brand} />
                  </PressableOpacity>

                  <Text style={{ fontSize: 24, fontWeight: '900', color: colors.textPrimary, minWidth: 28, textAlign: 'center' }}>
                    {localGuestCount}
                  </Text>

                  <PressableOpacity accessibilityLabel="Increase"
                    onPress={() => setLocalGuestCount(c => c + 1)}
                    style={{
                      width: 36, height: 36, borderRadius: 18,
                      backgroundColor: colors.brandSoft,
                      borderWidth: 1.5, borderColor: colors.brand,
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Feather name="plus" size={16} color={colors.brand} />
                  </PressableOpacity>

                  {/* Confirm */}
                  <PressableOpacity
                    onPress={() => { setGuestExpanded(false); onRsvp('in', localGuestCount); }}
                    disabled={isRsvping}
                    style={{
                      width: 36, height: 36, borderRadius: 18,
                      backgroundColor: colors.accentTeal,
                      borderWidth: 1.5, borderColor: '#3FABA1',
                      alignItems: 'center', justifyContent: 'center',
                      marginLeft: 6,
                    }}
                  >
                    {isRsvping
                      ? <ActivityIndicator size="small" color="white" />
                      : <Feather name="check" size={18} color="white" />
                    }
                  </PressableOpacity>
                </View>
                </View>
              )}
            </>
          )}
        </View>
      )}
    </View>
  );
};
