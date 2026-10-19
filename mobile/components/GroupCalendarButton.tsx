import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { Feather } from '@expo/vector-icons';
import GroupMeetupsModal from '@/components/GroupMeetupsModal';
import { useAppearance } from '@/contexts/AppearanceContext';

interface GroupCalendarButtonProps {
  groupId: string;
  isDM: boolean;
}

// Shared by Group Details and Group Chat; renders nothing for DMs (no meetups).
export const GroupCalendarButton = ({ groupId, isDM }: GroupCalendarButtonProps) => {
  const { scheme } = useAppearance();
  const isDark = scheme === 'dark';
  const [modalVisible, setModalVisible] = useState(false);

  if (isDM) return null;

  return (
    <>
      <PressableOpacity accessibilityLabel="Calendar"
        onPress={() => setModalVisible(true)}
        style={[styles.iconButton, { backgroundColor: isDark ? '#3A2E12' : '#FFFBEB', borderColor: isDark ? '#5C4A1E' : '#FDE68A' }]}
      >
        <Feather name="calendar" size={18} color="#D97706" />
      </PressableOpacity>

      <GroupMeetupsModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        groupId={groupId}
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
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
});
