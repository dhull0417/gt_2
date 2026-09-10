import { View, Text, TextInput, TouchableOpacity, Modal, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiClient, userApi, User } from '@/utils/api';

interface UpdateNameModalProps {
  visible: boolean;
  onClose: () => void;
}

// Shown to Apple sign-in users with no name on file — Apple only grants a name on an
// account's very first authorization ever (see useAppleAuth.ts), so a returning or
// re-created account can land here with nothing captured. Driven by currentUser data
// rather than a one-time-seen flag (see showUpdateNameModal in app/_layout.tsx), so it
// reappears on the next app open until the name is actually filled in.
export function UpdateNameModal({ visible, onClose }: UpdateNameModalProps) {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  const saveName = useMutation({
    mutationFn: () => userApi.updateProfile(api, { firstName: firstName.trim(), lastName: lastName.trim() }),
    onSuccess: (res) => {
      if (res.data?.user) {
        queryClient.setQueryData<User>(['currentUser'], res.data.user);
      } else {
        queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      }
      setFirstName('');
      setLastName('');
      onClose();
    },
  });

  const canSave = firstName.trim().length > 0 && lastName.trim().length > 0;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 items-center justify-center px-8"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      >
        <View className="w-full bg-white rounded-2xl p-6">
          <Text className="text-xl font-bold text-gray-800 mb-1">Update Name!</Text>
          <Text className="text-sm text-gray-600 mb-4">Make sure your friends know who you are.</Text>

          <TextInput
            placeholder="First Name"
            value={firstName}
            onChangeText={setFirstName}
            className="w-full bg-gray-50 p-4 border border-gray-300 rounded-lg text-base mb-3"
            style={{ height: 52, paddingVertical: 0, textAlignVertical: 'center', lineHeight: undefined }}
            placeholderTextColor="#999"
          />
          <TextInput
            placeholder="Last Name"
            value={lastName}
            onChangeText={setLastName}
            className="w-full bg-gray-50 p-4 border border-gray-300 rounded-lg text-base mb-4"
            style={{ height: 52, paddingVertical: 0, textAlignVertical: 'center', lineHeight: undefined }}
            placeholderTextColor="#999"
          />

          <TouchableOpacity
            onPress={() => saveName.mutate()}
            disabled={!canSave || saveName.isPending}
            className={`w-full py-4 rounded-lg items-center shadow ${canSave ? 'bg-[#4A90E2]' : 'bg-gray-300'}`}
          >
            {saveName.isPending
              ? <ActivityIndicator color="#fff" />
              : <Text className="text-white text-lg font-bold">Save</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={onClose} className="mt-3 items-center">
            <Text className="text-sm text-gray-400">Skip for now</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
