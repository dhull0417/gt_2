import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { Feather } from '@expo/vector-icons';
import { useThemeColors } from '@/contexts/AppearanceContext';

const AddMembersLayout = () => {
    const router = useRouter();
    const colors = useThemeColors();

    return (
        <Stack screenOptions={{ contentStyle: { backgroundColor: colors.background } }}>
            <Stack.Screen
                name="[id]"
                options={{
                    headerTitle: 'Invite Members',
                    presentation: 'card',
                    animation: 'slide_from_right',
                    headerLeft: () => (
                        <PressableOpacity accessibilityLabel="Close" onPress={() => router.back()} style={{ marginLeft: 10 }}>
                            <Feather name="x" size={24} color="#4A90E2" />
                        </PressableOpacity>
                    ),
                }}
            />
        </Stack>
    );
};

export default AddMembersLayout;