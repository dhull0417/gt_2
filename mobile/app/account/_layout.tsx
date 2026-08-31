import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { Platform, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';

const AccountLayout = () => {
    const router = useRouter();

    return (
        <Stack screenOptions={{ headerTitleAlign: 'center' }}>
            <Stack.Screen
                name="index"
                options={{
                    headerTitle: 'Update Account',
                    headerLeft: () => (
                        <TouchableOpacity
                            onPress={() => router.back()}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
                        >
                            <Feather name="x" size={24} color="#374151" style={{ transform: [{ translateX: 2 }] }} />
                        </TouchableOpacity>
                    ),
                }}
            />
            <Stack.Screen
                name="update-name"
                options={{
                    headerTitle: 'Update Name',
                    // iOS back button shows the prev screen's title, too cramped next to "Update Name" — use modal instead
                    // Android's back button has no title, so it doesn't need this
                    presentation: Platform.OS === 'ios' ? 'modal' : undefined,
                }}
            />
            <Stack.Screen 
                name="update-email" 
                options={{ 
                    headerTitle: 'Update Email',
                    presentation: 'modal',
                }} 
            />
            <Stack.Screen 
                name="verify-email" 
                options={{ 
                    headerTitle: 'Verify New Email',
                    presentation: 'modal',
                }} 
            />
            <Stack.Screen
                name="change-password"
                options={{
                    headerTitle: 'Change Password',
                    presentation: 'modal',
                }}
            />
            <Stack.Screen
                name="delete-account"
                options={{
                    headerTitle: 'Delete Account',
                    presentation: 'modal',
                }}
            />
        </Stack>
    );
};

export default AccountLayout;