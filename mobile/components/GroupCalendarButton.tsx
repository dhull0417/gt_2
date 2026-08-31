import React, { useState } from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import GroupMeetupsModal from '@/components/GroupMeetupsModal';

interface GroupCalendarButtonProps {
  groupId: string;
  isDM: boolean;
}

// Shared by Group Details and Group Chat; renders nothing for DMs (no meetups).
export const GroupCalendarButton = ({ groupId, isDM }: GroupCalendarButtonProps) => {
  const [modalVisible, setModalVisible] = useState(false);

  if (isDM) return null;

  return (
    <>
      <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.iconButton}>
        <Feather name="calendar" size={18} color="#D97706" />
      </TouchableOpacity>

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
