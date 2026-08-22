import React, { useState } from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import GroupMeetupsModal from '@/components/GroupMeetupsModal';

interface GroupCalendarButtonProps {
  groupId: string;
  isDM: boolean;
}

// Shared by the Group Details and Group Chat screens (both need the same calendar
// icon/modal behavior). DMs have no meetups, so this renders nothing for them.
export const GroupCalendarButton = ({ groupId, isDM }: GroupCalendarButtonProps) => {
  const [modalVisible, setModalVisible] = useState(false);

  if (isDM) return null;

  return (
    <>
      <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.iconButton}>
        <Feather name="calendar" size={18} color="#4A90E2" />
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
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
});
