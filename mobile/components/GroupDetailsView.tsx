import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, TextInput, ActivityIndicator, Modal, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { GroupDetails, User, useApiClient } from '@/utils/api';
import { formatSchedule } from '@/utils/schedule';
import { useQueryClient } from '@tanstack/react-query';

interface GroupDetailsViewProps {
  groupDetails: GroupDetails;
  currentUser: User;
  isRemovingMember: boolean;
  onRemoveMember: (memberIdToRemove: string) => void;
  searchQuery: string;
  onSearchChange: (text: string) => void;
  searchResults: User[] | undefined;
  onInvite: (id: string) => void;
  isInviting: boolean;
  onDeleteGroup: () => void;
  isDeletingGroup: boolean;
  onLeaveGroup: () => void;
  isLeavingGroup: boolean;
  onEditSchedule?: () => void;
  onAddOneOffEvent?: () => void;
}

export const GroupDetailsView = ({
  groupDetails,
  currentUser,
  isRemovingMember,
  onRemoveMember,
  searchQuery,
  onSearchChange,
  searchResults,
  onInvite,
  isInviting,
  onDeleteGroup,
  isDeletingGroup,
  onLeaveGroup,
  isLeavingGroup,
  onEditSchedule,
  onAddOneOffEvent
}: GroupDetailsViewProps) => {
  const isOwner = currentUser._id === groupDetails.owner;
  const api = useApiClient();
  const queryClient = useQueryClient();

  // State for Default Capacity Modal
  const [isCapModalVisible, setIsCapModalVisible] = useState(false);
  const [newDefaultCapacity, setNewDefaultCapacity] = useState('');
  const [isUpdatingCap, setIsUpdatingCap] = useState(false);

  const handleUpdateDefaultCapacity = async () => {
    const capInt = parseInt(newDefaultCapacity);
    if (isNaN(capInt) || capInt < 0 || capInt > 1000000) {
        Alert.alert("Invalid Input", "Please enter a number between 0 and 1,000,000 (0 for unlimited).");
        return;
    }

    setIsUpdatingCap(true);
    try {
        // We use the patch endpoint designed for schedule/settings updates
        await api.patch(`/api/groups/${groupDetails._id}/schedule`, {
            schedule: groupDetails.schedule,
            time: groupDetails.time,
            timezone: groupDetails.timezone,
            defaultCapacity: capInt
        });
        
        queryClient.invalidateQueries({ queryKey: ['groupDetails', groupDetails._id] });
        setIsCapModalVisible(false);
        setNewDefaultCapacity('');
        Alert.alert("Success", "Default capacity updated. Future events will use this limit.");
    } catch (error) {
        Alert.alert("Error", "Failed to update default capacity.");
    } finally {
        setIsUpdatingCap(false);
    }
  };

  return (
    <View style={{ paddingBottom: 100 }}>
      {/* --- Schedule Section --- */}
      {groupDetails.schedule && (
        <View className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6">
          <View className="flex-row justify-between items-center mb-2 px-1">
            <Text className="text-sm font-bold text-gray-400 uppercase tracking-widest">Schedule & Capacity</Text>
            {isOwner && (
                <View className="flex-row">
                    {onAddOneOffEvent && (
                        <TouchableOpacity 
                            onPress={onAddOneOffEvent} 
                            className="flex-row items-center bg-green-50 px-2 py-1 rounded-lg mr-2"
                        >
                            <Feather name="plus" size={12} color="#10B981" />
                            <Text className="text-green-700 text-xs font-bold ml-1">Add Meeting</Text>
                        </TouchableOpacity>
                    )}
                    {onEditSchedule && (
                        <TouchableOpacity 
                            onPress={onEditSchedule} 
                            className="flex-row items-center bg-indigo-50 px-2 py-1 rounded-lg"
                        >
                            <Feather name="edit-2" size={12} color="#4F46E5" />
                            <Text className="text-indigo-600 text-xs font-bold ml-1">Edit</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}
          </View>
          <View className="flex-row items-center mb-3">
            <View className="w-10 h-10 bg-indigo-50 rounded-full items-center justify-center mr-3">
              <Feather name="calendar" size={20} color="#4F46E5" />
            </View>
            <Text className="text-base text-gray-800 font-semibold flex-1">
              {formatSchedule(groupDetails.schedule)}
            </Text>
          </View>
          <View className="flex-row items-center">
            <View className="w-10 h-10 bg-indigo-50 rounded-full items-center justify-center mr-3">
              <Feather name="users" size={20} color="#4F46E5" />
            </View>
            <Text className="text-base text-gray-800 font-semibold flex-1">
              Default Limit: {groupDetails.defaultCapacity === 0 ? "Unlimited" : groupDetails.defaultCapacity}
            </Text>
          </View>
        </View>
      )}

      {/* --- Members Section --- */}
      <View className="mb-6">
        <Text className="text-xl font-bold text-gray-800 mb-3 px-1">Members ({groupDetails.members.length})</Text>
        {groupDetails.members.map(member => (
          <View key={member._id} className="flex-row items-center justify-between bg-white p-3 rounded-2xl shadow-sm border border-gray-100 mb-2">
            <View className="flex-row items-center">
              <Image 
                source={{ uri: member.profilePicture || `https://placehold.co/100x100/EEE/31343C?text=${member.firstName?.[0] || '?'}` }} 
                className="w-12 h-12 rounded-full mr-3" 
              />
              <View>
                <Text className="text-base font-bold text-gray-800">{member.firstName} {member.lastName}</Text>
                <Text className="text-xs text-gray-500">@{member.username}</Text>
              </View>
            </View>
            {isOwner && member._id !== currentUser._id && (
              <TouchableOpacity onPress={() => onRemoveMember(member._id)} disabled={isRemovingMember} className="p-2">
                <Feather name="x-circle" size={22} color="#EF4444" />
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>

      {/* --- Invite Section --- */}
      {isOwner && (
        <View className="mb-8">
          <Text className="text-xl font-bold text-gray-800 mb-3 px-1">Invite Members</Text>
          <View className="flex-row items-center bg-white border border-gray-200 rounded-2xl px-4 py-1 shadow-sm">
            <Feather name="search" size={18} color="#9CA3AF" />
            <TextInput
              className="flex-1 p-3 text-base text-gray-900"
              placeholder="Search by username..."
              value={searchQuery}
              onChangeText={onSearchChange}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          {searchQuery.length > 0 && searchResults && (
            <View className="mt-2 border border-gray-100 rounded-2xl bg-white overflow-hidden shadow-lg">
              {searchResults.length > 0 ? (
                searchResults.map(user => {
                  const isJoined = groupDetails.members.some(m => m._id === user._id);
                  return (
                    <TouchableOpacity
                      key={user._id}
                      className="flex-row items-center justify-between p-4 border-b border-gray-50"
                      onPress={() => onInvite(user._id)}
                      disabled={isInviting || isJoined}
                    >
                      <View className="flex-row items-center">
                        <Image 
                          source={{ uri: user.profilePicture || `https://placehold.co/100x100/EEE/31343C?text=${user.username?.[0] || '?'}` }} 
                          className="w-8 h-8 rounded-full mr-3" 
                        />
                        <Text className="text-base text-gray-700 font-medium">@{user.username}</Text>
                      </View>
                      {isJoined ? (
                        <Text className="text-gray-400 font-bold italic">Joined</Text>
                      ) : isInviting ? (
                        <ActivityIndicator size="small" color="#4F46E5" />
                      ) : (
                        <Text className="text-indigo-600 font-bold">Invite</Text>
                      )}
                    </TouchableOpacity>
                  );
                })
              ) : (
                <View className="p-4 items-center">
                  <Text className="text-gray-500 italic">No users found.</Text>
                </View>
              )}
            </View>
          )}
        </View>
      )}

      {/* --- Action Section --- */}
      <View className="border-t border-gray-200 pt-6 mt-4">
        {isOwner && (
            <TouchableOpacity
                onPress={() => {
                    setNewDefaultCapacity(groupDetails.defaultCapacity.toString());
                    setIsCapModalVisible(true);
                }}
                className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex-row items-center justify-center shadow-sm mb-3"
            >
                <Feather name="settings" size={20} color="#4F46E5" />
                <Text className="text-indigo-600 font-bold text-lg ml-2">Set Default Capacity</Text>
            </TouchableOpacity>
        )}

        {isOwner ? (
          <TouchableOpacity
            onPress={onDeleteGroup}
            disabled={isDeletingGroup}
            className="bg-red-50 border border-red-100 rounded-2xl p-4 flex-row items-center justify-center shadow-sm"
          >
            {isDeletingGroup ? <ActivityIndicator color="#EF4444" /> : (
                <>
                    <Feather name="trash-2" size={20} color="#EF4444" />
                    <Text className="text-red-600 font-bold text-lg ml-2">Delete Group</Text>
                </>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={onLeaveGroup}
            disabled={isLeavingGroup}
            className="bg-red-50 border border-red-100 rounded-2xl p-4 flex-row items-center justify-center shadow-sm"
          >
            {isLeavingGroup ? <ActivityIndicator color="#EF4444" /> : (
                <>
                    <Feather name="log-out" size={20} color="#EF4444" />
                    <Text className="text-red-600 font-bold text-lg ml-2">Leave Group</Text>
                </>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Capacity Update Modal */}
      <Modal transparent visible={isCapModalVisible} animationType="fade">
          <View className="flex-1 bg-black/60 justify-center items-center p-6">
              <View className="bg-white w-full rounded-3xl overflow-hidden shadow-2xl">
                  <View className="bg-indigo-600 p-6">
                      <Text className="text-white text-xl font-black text-center">Group Default Capacity</Text>
                      <Text className="text-indigo-100 text-center text-xs mt-1">This limit will apply to all future recurring events.</Text>
                  </View>
                  <View className="p-6">
                      <TextInput
                          className="bg-gray-100 p-4 rounded-xl text-center text-2xl font-black text-gray-800"
                          keyboardType="numeric"
                          placeholder="0 = Unlimited"
                          value={newDefaultCapacity}
                          onChangeText={setNewDefaultCapacity}
                          autoFocus
                      />
                      <View className="flex-row space-x-3 mt-6">
                          <TouchableOpacity 
                              onPress={() => setIsCapModalVisible(false)}
                              className="flex-1 bg-gray-200 py-4 rounded-xl items-center"
                          >
                              <Text className="text-gray-600 font-bold">Cancel</Text>
                          </TouchableOpacity>
                          <TouchableOpacity 
                              onPress={handleUpdateDefaultCapacity}
                              disabled={isUpdatingCap}
                              className="flex-1 bg-indigo-600 py-4 rounded-xl items-center"
                          >
                              {isUpdatingCap ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold">Save</Text>}
                          </TouchableOpacity>
                      </View>
                  </View>
              </View>
          </View>
      </Modal>
    </View>
  );
};