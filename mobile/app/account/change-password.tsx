import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import React, { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useChangePassword } from '@/hooks/useChangePassword';

const ChangePasswordScreen = () => {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const [isCurrentVisible, setCurrentVisible] = useState(false);
    const [isNewVisible, setNewVisible] = useState(false);
    const [isConfirmVisible, setConfirmVisible] = useState(false);
    
    const { mutate: changePassword, isPending } = useChangePassword();

    const handleSave = () => {
        if (!currentPassword || !newPassword) {
            Alert.alert('Error', 'Please fill out all fields.');
            return;
        }
        if (newPassword !== confirmPassword) {
            Alert.alert('Error', 'New passwords do not match.');
            return;
        }
        changePassword({ currentPassword, newPassword });
    };

    return (
        <SafeAreaView className="flex-1 bg-gray-100">
            <KeyboardAvoidingView 
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                className="flex-1"
            >
                <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="p-6">
                    <View className="mb-6">
                        <Text className="text-sm text-gray-600 mb-1">Current Password</Text>
                        <View className="w-full flex-row items-center bg-white border border-gray-300 rounded-lg pr-4">
                            <TextInput
                                value={currentPassword}
                                onChangeText={setCurrentPassword}
                                placeholder="Enter your current password"
                                placeholderTextColor="#9CA3AF"
                                secureTextEntry={!isCurrentVisible}
                                className="flex-1 p-4 text-base"
                            />
                            <TouchableOpacity onPress={() => setCurrentVisible(!isCurrentVisible)}>
                                <Feather name={isCurrentVisible ? 'eye-off' : 'eye'} size={22} color="#6B7280" />
                            </TouchableOpacity>
                        </View>
                    </View>
                    <View className="mb-4">
                        <Text className="text-sm text-gray-600 mb-1">New Password</Text>
                        <View className="w-full flex-row items-center bg-white border border-gray-300 rounded-lg pr-4">
                            <TextInput
                                value={newPassword}
                                onChangeText={setNewPassword}
                                placeholder="Enter your new password"
                                placeholderTextColor="#9CA3AF"
                                secureTextEntry={!isNewVisible}
                                className="flex-1 p-4 text-base"
                            />
                            <TouchableOpacity onPress={() => setNewVisible(!isNewVisible)}>
                                <Feather name={isNewVisible ? 'eye-off' : 'eye'} size={22} color="#6B7280" />
                            </TouchableOpacity>
                        </View>
                    </View>
                    <View className="mb-8">
                        <Text className="text-sm text-gray-600 mb-1">Confirm New Password</Text>
                        <View className="w-full flex-row items-center bg-white border border-gray-300 rounded-lg pr-4">
                            <TextInput
                                value={confirmPassword}
                                onChangeText={setConfirmPassword}
                                placeholder="Confirm your new password"
                                placeholderTextColor="#9CA3AF"
                                secureTextEntry={!isConfirmVisible}
                                className="flex-1 p-4 text-base"
                            />
                            <TouchableOpacity onPress={() => setConfirmVisible(!isConfirmVisible)}>
                                <Feather name={isConfirmVisible ? 'eye-off' : 'eye'} size={22} color="#6B7280" />
                            </TouchableOpacity>
                        </View>
                    </View>
                    <TouchableOpacity
                        onPress={handleSave}
                        disabled={isPending}
                        className={`w-full py-4 rounded-lg items-center shadow ${isPending ? 'bg-indigo-300' : 'bg-indigo-600'}`}
                    >
                        <Text className="text-white text-lg font-bold">{isPending ? "Saving..." : "Save New Password"}</Text>
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

export default ChangePasswordScreen;