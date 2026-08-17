import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import PollListModal from '@/components/PollListModal';
import { useGetPolls } from '@/hooks/useGetPolls';

interface GroupPollButtonProps {
  groupId: string;
  currentUserId: string;
  canManage: boolean;
  isDM: boolean;
}

// Shared by the Group Details and Group Chat screens (both need the same poll
// icon/tooltip/list behavior). DMs have no polls, so this renders nothing for them.
export const GroupPollButton = ({ groupId, currentUserId, canManage, isDM }: GroupPollButtonProps) => {
  const [pollListVisible, setPollListVisible] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [pollTooltipAnchor, setPollTooltipAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const pollButtonRef = useRef<View>(null);

  const { data: polls } = useGetPolls(!isDM ? groupId : undefined);

  const hasUnansweredPoll = useMemo(() => {
    if (!polls) return false;
    return polls.some(poll =>
      poll.status === 'active' &&
      !poll.options.some(opt => opt.voters.some(v => (typeof v === 'string' ? v : v._id) === currentUserId))
    );
  }, [polls, currentUserId]);

  useEffect(() => {
    if (!hasUnansweredPoll) { setTooltipVisible(false); return; }
    setTooltipVisible(true);
    const timer = setTimeout(() => setTooltipVisible(false), 4000);
    return () => clearTimeout(timer);
  }, [hasUnansweredPoll]);

  const handlePollButtonLayout = () => {
    pollButtonRef.current?.measure((_x, _y, width, height, pageX, pageY) => {
      setPollTooltipAnchor({ x: pageX, y: pageY, width, height });
    });
  };

  const handlePollButtonPress = () => {
    setTooltipVisible(false);
    setPollListVisible(true);
  };

  if (isDM) return null;

  return (
    <>
      <TouchableOpacity
        ref={pollButtonRef}
        onLayout={handlePollButtonLayout}
        onPress={handlePollButtonPress}
        style={styles.iconButton}
      >
        <Feather name="bar-chart-2" size={18} color="#4A90E2" />
        {hasUnansweredPoll && <View style={styles.pollUnansweredDot} />}
      </TouchableOpacity>

      {tooltipVisible && pollTooltipAnchor && (
        <View
          pointerEvents="none"
          style={[
            styles.pollTooltip,
            {
              top: pollTooltipAnchor.y + pollTooltipAnchor.height + 8,
              left: pollTooltipAnchor.x + pollTooltipAnchor.width / 2 - 60,
            },
          ]}
        >
          <View style={[styles.pollTooltipArrow, { left: 60 - 6 }]} />
          <Text style={styles.pollTooltipText}>New poll open!</Text>
        </View>
      )}

      <PollListModal
        visible={pollListVisible}
        onClose={() => setPollListVisible(false)}
        groupId={groupId}
        currentUserId={currentUserId}
        canManage={canManage}
      />
    </>
  );
};

const styles = StyleSheet.create({
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
  pollUnansweredDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: 'white',
  },
  pollTooltip: {
    position: 'absolute',
    backgroundColor: '#111827',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    zIndex: 999,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  pollTooltipText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
  },
  pollTooltipArrow: {
    position: 'absolute',
    top: -6,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#111827',
  },
});
