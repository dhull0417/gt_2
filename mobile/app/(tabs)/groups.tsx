import { View, Text, ScrollView, TouchableOpacity, Modal } from 'react-native';
import React, { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import SignOutButton from '@/components/SignOutButton';
import { useUserSync } from '@/hooks/useUserSync';
import { Ionicons } from '@expo/vector-icons';
import CreateGroupPopup from '@/components/CreateGroupPopup';

const GroupScreen = () => {
const [isModalVisible, setIsModalVisible] = useState(false);

const handleOpenModal = () => {
setIsModalVisible(true);
};

const handleCloseModal = () => {
setIsModalVisible(false);
};

return (
<SafeAreaView className='flex-1'>
<View className="flex-row justify-between items-center px-4 py-3 border-b border-gray-100">
<Text className="text-xl font-bold text-gray-900">Groups</Text>
<SignOutButton />
</View>

  <ScrollView>
    <View className="text-white font-bold py-2 px-5 rounded-full">
      <TouchableOpacity
        className="px-10 py-6 rounded-full bg-blue-400 items-center"
        onPress={handleOpenModal}
      >
        <Text className="text-white text-2xl">
          Create Group
        </Text>
      </TouchableOpacity>
    </View>
  </ScrollView>

  <Modal
    animationType="slide"
    transparent={true}
    visible={isModalVisible}
    onRequestClose={handleCloseModal}
  >
    <View className="flex-1 justify-center items-center bg-black bg-opacity-50">
      <CreateGroupPopup onClose={handleCloseModal} />
    </View>
  </Modal>
</SafeAreaView>

);
};

export default GroupScreen;