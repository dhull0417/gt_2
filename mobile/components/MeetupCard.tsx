import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Feather, MaterialIcons, Ionicons } from '@expo/vector-icons';
import ReanimatedAnimated from 'react-native-reanimated';
import { Meetup, User } from '@/utils/api';
import { GroupAvatar } from '@/components/GroupAvatar';
import { RsvpBreather } from '@/components/RsvpBreather';

const getUserId = (u: User | string): string => typeof u === 'string' ? u : u._id;

const formatDate = (dateString: string, timezone: string) => {
    const options: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric', timeZone: timezone };
    return new Date(dateString).toLocaleDateString(undefined, options);
};

const RsvpCounts = ({ meetup }: { meetup: Meetup }) => {
    const totalGuests = (meetup.guests || []).reduce((sum, g) => sum + (g.count || 0), 0);
    return (
        <View className="flex-row items-center mt-3 flex-wrap">
            <View className="flex-row items-center mr-4">
                <View className="w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: '#4FD1C5' }} />
                <Text className="text-gray-600 font-medium">
                    {meetup.in.length + totalGuests}{meetup.capacity > 0 ? `/${meetup.capacity}` : ''} In
                </Text>
            </View>

            <View className="flex-row items-center mr-4">
                <View className="w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: '#FF7A6E' }} />
                <Text className="text-gray-600 font-medium">{meetup.out.length} Out</Text>
            </View>
        </View>
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

  const isCancelled = meetup.status === 'cancelled';
  const isPast = new Date(meetup.date) < new Date();
  const isExpired = meetup.status === 'expired' || isPast;
  const isRsvpLocked = meetup.rsvpOpenDate ? new Date(meetup.rsvpOpenDate) > new Date() : false;
  const isRsvpDeadlinePassed = meetup.rsvpCloseDate ? new Date(meetup.rsvpCloseDate) < new Date() : false;

  const isFull = meetup.capacity > 0 && meetup.in.length >= meetup.capacity;
  const isWaitlisted = currentUser ? meetup.waitlist.some(u => getUserId(u) === currentUser._id) : false;
  const isIn = currentUser ? meetup.in.some(u => getUserId(u) === currentUser._id) : false;
  const isOut = currentUser ? meetup.out.some(u => getUserId(u) === currentUser._id) : false;
  const inUnselected = !isIn && !isWaitlisted && !(isFull && !isIn);
  const outUnselected = !isOut;
  const isUndecided = inUnselected && outUnselected;
  // While undecided, fill both buttons like they're selected so neither reads as the "default" choice.
  const inFilled = !inUnselected || isUndecided;
  const outFilled = !outUnselected || isUndecided;

  const isReadOnly = isCancelled || isExpired;

  // Faint RSVP-status tint to match the detail modal: amber until the user
  // responds, then green ("in"/waitlisted) or red ("out").
  const rsvpBackgroundColor = isOut ? '#FEF2F2' : (isIn || isWaitlisted) ? '#EDF5F0' : '#FFFEFA';

  return (
    <View
      className={`p-5 my-2 rounded-2xl shadow-sm border relative ${
        isCancelled ? 'bg-red-50/30 border-red-100 opacity-80' :
        isExpired ? 'bg-gray-100 border-gray-200' : 'border-gray-200'
      }`}
      style={{
        ...(isExpired && !isCancelled ? { opacity: 0.75 } : {}),
        ...(!isReadOnly ? { backgroundColor: rsvpBackgroundColor } : {}),
      }}
    >
      <TouchableOpacity onPress={onPress} style={{ flexDirection: 'row' }}>
        <View style={{ marginRight: 12 }}>
          <GroupAvatar name={meetup.group.name} imageUrl={meetup.group.image} size={44} />
        </View>
        <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1 }}>
          {meetup.time}
        </Text>

        <View className="flex-row justify-between items-start" style={{ marginTop: 4 }}>
          <View className="flex-1 pr-6">
            <Text
              style={{
                fontSize: 20,
                fontWeight: 'bold',
                color: isReadOnly ? '#9CA3AF' : '#4FD1C5',
                textDecorationLine: isCancelled ? 'line-through' : 'none'
              }}
            >
              {meetup.name}
            </Text>
            {isCancelled && (
              <View className="bg-red-100 self-start px-2 py-0.5 rounded-md mt-1">
                <Text className="text-red-600 text-[10px] font-black uppercase">Cancelled</Text>
              </View>
            )}
            {isExpired && !isCancelled && (
              <View className="bg-gray-300 self-start px-2 py-0.5 rounded-md mt-1">
                <Text className="text-gray-700 text-[10px] font-black uppercase">Past Event</Text>
              </View>
            )}
          </View>
          {!isReadOnly && (
            isIn || isOut ? (
              <Text style={{ fontSize: 13, fontWeight: '900', letterSpacing: 1, color: isIn ? '#4FD1C5' : '#FF7A6E' }}>
                {isIn ? 'IN' : 'OUT'}
              </Text>
            ) : isRsvpLocked ? (
              <Feather name="clock" size={20} color="#9CA3AF" />
            ) : isRsvpDeadlinePassed ? (
              <Feather name="lock" size={20} color="#9CA3AF" />
            ) : (
              <Ionicons name="mail-open-outline" size={20} color="#F59E0B" />
            )
          )}
        </View>

        {!isReadOnly && <RsvpCounts meetup={meetup} />}

        <View className="flex-row mt-2">
            {isFull && !isReadOnly && !isIn && (
                <View className="bg-orange-100 px-2 py-1 rounded-lg mr-2 border border-orange-200">
                    <Text className="text-orange-600 text-[10px] font-black">FULL</Text>
                </View>
            )}
            {isWaitlisted && (
                <View className="bg-blue-100 px-2 py-1 rounded-lg border border-blue-200">
                    <Text className="text-blue-600 text-[10px] font-black uppercase">Waitlisted</Text>
                </View>
            )}
        </View>

        {isExpired && !isCancelled && (
          <View className="mt-3 pt-3 border-t border-gray-200 flex-row items-center">
            <Feather name="info" size={12} color="#9CA3AF" />
            <Text className="text-[#9CA3AF] text-[11px] font-bold uppercase ml-1.5 tracking-tight">
              View History & Details
            </Text>
          </View>
        )}
        </View>
      </TouchableOpacity>

      {showRsvpButtons && !isReadOnly && (
        <View className="mt-4 pt-4 border-t border-gray-100">
          {isRsvpLocked ? (
            <View className="bg-gray-100 py-3 rounded-xl items-center border border-gray-200">
              <View className="flex-row items-center">
                <Feather name="lock" size={22} color="#6B7280" className="mr-2" />
                <Text className="text-gray-600 font-bold text-sm ml-1.5">
                  RSVPs open on {formatDate(meetup.rsvpOpenDate!, meetup.timezone)}
                </Text>
              </View>
            </View>
          ) : isRsvpDeadlinePassed ? (
            <View className="bg-gray-100 py-3 rounded-xl items-center border border-gray-200">
              <View className="flex-row items-center">
                <Feather name="lock" size={22} color="#6B7280" className="mr-2" />
                <Text className="text-gray-600 font-bold text-sm ml-1.5">
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
                      backgroundColor: isWaitlisted ? '#2563EB' : (isFull && !isIn) ? '#F97316' : inFilled ? '#4FD1C5' : 'white',
                    }}>
                      <ReanimatedAnimated.View style={[{
                        flex: 1, flexDirection: 'row', borderRadius: 12,
                        borderWidth: inFilled ? 0 : 1.5,
                        borderColor: '#4FD1C5',
                      }, boxStyle]}>
                        <TouchableOpacity
                          onPress={() => { setGuestExpanded(false); onRsvp('in', 0); }}
                          disabled={isRsvping}
                          style={{ flex: 7, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <ReanimatedAnimated.Text style={[{ color: inFilled ? 'white' : '#4FD1C5', fontWeight: 'bold', fontSize: 16 }, inTextStyle]}>
                            {isWaitlisted ? "Waitlisted" : (isFull && !isIn) ? "Join Waitlist" : "I'm In"}
                          </ReanimatedAnimated.Text>
                        </TouchableOpacity>
                        <View style={{ width: 1, backgroundColor: inFilled ? 'rgba(255,255,255,0.35)' : '#D1FAE5' }} />
                        <TouchableOpacity
                          onPress={() => { setLocalGuestCount(0); setGuestExpanded(v => !v); }}
                          disabled={isRsvping}
                          style={{ flex: 3, alignItems: 'center', justifyContent: 'center' }}
                        >
                          {guestExpanded
                            ? <Feather name="x" size={18} color={inFilled ? 'white' : '#4FD1C5'} />
                            : <MaterialIcons name="group-add" size={20} color={inFilled ? 'white' : '#4FD1C5'} />
                          }
                        </TouchableOpacity>
                      </ReanimatedAnimated.View>
                    </View>
                    {/* Split I'm Out button: left 70% = RSVP out, right 30% = RSVP out + mute group */}
                    <View style={{
                      flex: 1, borderRadius: 12, overflow: 'hidden', height: 48,
                      backgroundColor: outFilled ? '#FF7A6E' : 'white',
                    }}>
                      <ReanimatedAnimated.View style={[{
                        flex: 1, flexDirection: 'row', borderRadius: 12,
                        borderWidth: outFilled ? 0 : 1.5,
                        borderColor: '#FF7A6E',
                      }, boxStyle]}>
                        <TouchableOpacity
                          onPress={() => { setGuestExpanded(false); onRsvp('out'); }}
                          disabled={isRsvping}
                          style={{ flex: 7, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <ReanimatedAnimated.Text style={[{ color: outFilled ? 'white' : '#FF7A6E', fontWeight: 'bold', fontSize: 16 }, outTextStyle]}>I'm Out</ReanimatedAnimated.Text>
                        </TouchableOpacity>
                        <View style={{ width: 1, backgroundColor: outFilled ? 'rgba(255,255,255,0.35)' : '#FFE4E1' }} />
                        <TouchableOpacity
                          onPress={() => { setGuestExpanded(false); onRsvp('out', 0, true); }}
                          disabled={isRsvping}
                          style={{ flex: 3, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Feather name="bell-off" size={18} color={outFilled ? 'white' : '#FF7A6E'} />
                        </TouchableOpacity>
                      </ReanimatedAnimated.View>
                    </View>
                  </View>
                )}
              </RsvpBreather>

              {/* Inline guest counter — expands below buttons when + is tapped */}
              {guestExpanded && (
                <View style={{ alignItems: 'center', marginTop: 10 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Add Guests?</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
                  <TouchableOpacity
                    onPress={() => setLocalGuestCount(c => Math.max(0, c - 1))}
                    disabled={localGuestCount === 0}
                    style={{
                      width: 36, height: 36, borderRadius: 18,
                      backgroundColor: localGuestCount === 0 ? '#F9FAFB' : '#EEF6FF',
                      borderWidth: 1.5,
                      borderColor: localGuestCount === 0 ? '#E5E7EB' : '#93C5FD',
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Feather name="minus" size={16} color={localGuestCount === 0 ? '#D1D5DB' : '#4A90E2'} />
                  </TouchableOpacity>

                  <Text style={{ fontSize: 24, fontWeight: '900', color: '#111827', minWidth: 28, textAlign: 'center' }}>
                    {localGuestCount}
                  </Text>

                  <TouchableOpacity
                    onPress={() => setLocalGuestCount(c => c + 1)}
                    style={{
                      width: 36, height: 36, borderRadius: 18,
                      backgroundColor: '#EEF6FF',
                      borderWidth: 1.5, borderColor: '#93C5FD',
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Feather name="plus" size={16} color="#4A90E2" />
                  </TouchableOpacity>

                  {/* Confirm */}
                  <TouchableOpacity
                    onPress={() => { setGuestExpanded(false); onRsvp('in', localGuestCount); }}
                    disabled={isRsvping}
                    style={{
                      width: 36, height: 36, borderRadius: 18,
                      backgroundColor: '#4FD1C5',
                      borderWidth: 1.5, borderColor: '#3FABA1',
                      alignItems: 'center', justifyContent: 'center',
                      marginLeft: 6,
                    }}
                  >
                    {isRsvping
                      ? <ActivityIndicator size="small" color="white" />
                      : <Feather name="check" size={18} color="white" />
                    }
                  </TouchableOpacity>
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
