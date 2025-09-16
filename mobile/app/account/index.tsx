import { View, Text, TouchableOpacity } from 'react-native';
import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { Feather } from '@expo/vector-icons';

const AccountSettingsScreen = () => {
    return (
        <SafeAreaView className="flex-1 bg-gray-100">
            <View className="mt-6 mx-4 space-y-2">
                <Link href="/account/update-name" asChild>
                    <TouchableOpacity className="bg-white p-4 rounded-lg flex-row justify-between items-center shadow-sm">
                        <Text className="text-base text-gray-800">Update Name</Text>
                        <Feather name="chevron-right" size={20} color="#6B7280" />
                    </TouchableOpacity>
                </Link>

                {/* --- ADDED: The button to start the email update flow --- */}
                <Link href="/account/update-email" asChild>
                    <TouchableOpacity className="bg-white p-4 rounded-lg flex-row justify-between items-center shadow-sm">
                        <Text className="text-base text-gray-800">Update Email</Text>
                        <Feather name="chevron-right" size={20} color="#6B7280" />
                    </TouchableOpacity>
                </Link>
            </View>
        </SafeAreaView>
    );
};

export default AccountSettingsScreen;