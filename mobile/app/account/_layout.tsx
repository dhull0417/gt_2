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
        </Stack>
    );
};

export default AccountLayout;