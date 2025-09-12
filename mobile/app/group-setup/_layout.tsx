import { Stack } from 'expo-router';
import React from 'react';

const GroupSetupLayout = () => {
    return (
        <Stack>
            <Stack.Screen 
                name="[id]" 
                options={{ 
                    headerTitle: 'Set Up Your Group',
                    headerBackTitle: 'Groups',
                }} 
            />
        </Stack>
    );
};
export default GroupSetupLayout;