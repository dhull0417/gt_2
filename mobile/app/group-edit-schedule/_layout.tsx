import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { TouchableOpacity } from 'react-native';
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
                        <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: 10 }}>
                            <Feather name="x" size={24} color={colors.brand} />
                        </TouchableOpacity>
                    ),
                }}
            />
        </Stack>
    );
};

export default GroupEditLayout;