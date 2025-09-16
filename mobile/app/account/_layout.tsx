import { Stack } from 'expo-router';
import React from 'react';

const AccountLayout = () => {
    return (
        <Stack>
            <Stack.Screen 
                name="index" 
                options={{ 
                    headerTitle: 'Account Settings',
                }} 
            />
            <Stack.Screen 
                name="update-name" 
                options={{ 
                    headerTitle: 'Update Name',
                    presentation: 'modal',
                }} 
            />
            {/* --- ADDED: New screens for the email update flow --- */}
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
        </Stack>
    );
};

export default AccountLayout;