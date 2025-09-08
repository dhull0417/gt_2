import React, { useState } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView } from 'react-native';
import { CreateGroupModal, GroupScheduleData } from '../../components/createGroupModal';
import { useCreateGroup } from '../../hooks/useCreateGroup';
import { useGetGroups } from '../../hooks/useGetGroups'; // Import the new hook
import { GroupList } from '../../components/GroupList'; // Import the new component

export default function GroupsScreen() {
  const [isModalVisible, setModalVisible] = useState(false);
  
  // Mutations and Queries
  const { mutate: createGroup, isPending: isCreating } = useCreateGroup();
  const { data: groups, isLoading: isLoadingGroups } = useGetGroups();

  const handleCreateGroup = (data: GroupScheduleData) => {
    createGroup(data, {
      onSuccess: () => {
        setModalVisible(false);
      }
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="flex-1 p-5">
        <Text className="text-3xl font-bold text-gray-800 mb-5">My Groups</Text>

        <TouchableOpacity 
          onPress={() => setModalVisible(true)} 
          className="bg-blue-600 py-3 px-5 rounded-xl self-start" // changed to self-start
        >
          <Text className="text-white font-bold text-lg text-center">Create New Group</Text>
        </TouchableOpacity>

        {/* Display the list of groups below the button */}
        <GroupList groups={groups} isLoading={isLoadingGroups} />

        <CreateGroupModal
          isVisible={isModalVisible}
          onClose={() => setModalVisible(false)}
          onSubmit={handleCreateGroup}
          isSubmitting={isCreating}
        />
      </View>
    </SafeAreaView>
  );
}