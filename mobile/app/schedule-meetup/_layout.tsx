import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useThemeColors } from '@/contexts/AppearanceContext';

const ScheduleMeetupLayout = () => {
    const router = useRouter();
    const colors = useThemeColors();

    return (
        <Stack screenOptions={{ contentStyle: { backgroundColor: colors.background } }}>
            <Stack.Screen
                name="[group-id]"
                options={{
                    headerTitle: 'Schedule One-Off Meetup',
                    presentation: 'modal',
                    headerLeft: () => (
                        <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: 10 }}>
                            <Feather name="x" size={24} color="#4A90E2" />
                        </TouchableOpacity>
                    ),
                }}
            />
        </Stack>
    );
};

export default ScheduleMeetupLayout;