import React from 'react';
import { View, Text, Image, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { GroupDetails, User } from '@/utils/api';
import { formatSchedule } from '@/utils/schedule';

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
  onEditSchedule?: () => void; // This solves the "Property does not exist" error
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
  onEditSchedule
}: GroupDetailsViewProps) => {
  const isOwner = currentUser._id === groupDetails.owner;

  return (
    <View className="pb-32">
      {/* --- Schedule Section --- */}
      {groupDetails.schedule && (
        <View className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6">
          <View className="flex-row justify-between items-center mb-2 px-1">
             <Text className="text-sm font-bold text-gray-400 uppercase tracking-widest">Schedule</Text>
             {isOwner && onEditSchedule && (
               <TouchableOpacity onPress={onEditSchedule} className="flex-row items-center">
                 <Feather name="edit-2" size={14} color="#4F46E5" />
                 <Text className="text-indigo-600 text-xs font-bold ml-1">Edit</Text>
               </TouchableOpacity>
             )}
          </View>
          <View className="flex-row items-center">
            <View className="w-10 h-10 bg-indigo-50 rounded-full items-center justify-center mr-3">
              <Feather name="calendar" size={20} color="#4F46E5" />
            </View>
            <Text className="text-base text-gray-800 font-semibold flex-1">
              {formatSchedule(groupDetails.schedule)}
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

      {/* --- Invitation Section (Owner Only) --- */}
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
              {searchResults.map(user => (
                <TouchableOpacity
                  key={user._id}
                  className="flex-row items-center justify-between p-4 border-b border-gray-50"
                  onPress={() => onInvite(user._id)}
                  disabled={isInviting || groupDetails.members.some(m => m._id === user._id)}
                >
                  <View className="flex-row items-center">
                    <Image source={{ uri: user.profilePicture }} className="w-8 h-8 rounded-full mr-3" />
                    <Text className="text-base text-gray-700 font-medium">@{user.username}</Text>
                  </View>
                  {groupDetails.members.some(m => m._id === user._id) ? (
                    <Text className="text-gray-400 font-bold italic">Joined</Text>
                  ) : isInviting ? (
                    <ActivityIndicator size="small" color="#4F46E5" />
                  ) : (
                    <Text className="text-indigo-600 font-bold">Invite</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}

      {/* --- Danger Zone --- */}
      <View className="border-t border-gray-200 pt-6 mt-4">
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
    </View>
  );
};