import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { Feather } from '@expo/vector-icons';
import { useThemeColors } from '@/contexts/AppearanceContext';

const GroupEditLayout = () => {
    const router = useRouter();
    const colors = useThemeColors();

    return (
        <Stack>
            <Stack.Screen
                name="[id]"
                options={{
                    headerTitle: 'Edit Group Schedule',
                    headerShown: false,
                    presentation: 'modal',
                    headerLeft: () => (
                        <PressableOpacity accessibilityLabel="Close" onPress={() => router.back()} style={{ marginLeft: 10 }}>
                            <Feather name="x" size={24} color={colors.brand} />
                        </PressableOpacity>
                    ),
                }}
            />
        </Stack>
    );
};

export default GroupEditLayout;