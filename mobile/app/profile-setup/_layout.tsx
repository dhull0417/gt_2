import { Stack } from 'expo-router';
import React from 'react';

const ProfileSetupLayout = () => {
    return (
        <Stack>
            <Stack.Screen 
                name="index" 
                options={{ 
                    headerShown: false,
                    presentation: 'modal',
                }} 
            />
        </Stack>
    );
};

export default ProfileSetupLayout;
