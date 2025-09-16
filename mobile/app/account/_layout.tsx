import { Stack } from 'expo-router';
import React from 'react';

const AccountLayout = () => {
    return (
        <Stack>
            <Stack.Screen 
                name="index" 
                options={{ 
                    headerShown: false, // Your change is preserved here
                }} 
            />
            <Stack.Screen 
                name="update-name" 
                options={{ 
                    headerTitle: 'Update Name',
                    presentation: 'modal',
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
                name="update-username" 
                options={{ 
                    headerTitle: 'Update Username',
                    presentation: 'modal',
                }} 
            />
        </Stack>
    );
};

export default AccountLayout;