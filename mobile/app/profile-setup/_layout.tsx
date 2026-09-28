import { Stack } from 'expo-router';
import React from 'react';
import { useThemeColors } from '@/contexts/AppearanceContext';

const ProfileSetupLayout = () => {
    const colors = useThemeColors();
    return (
        <Stack screenOptions={{ contentStyle: { backgroundColor: colors.background } }}>
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
