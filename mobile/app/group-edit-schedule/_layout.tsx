import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';

const GroupEditLayout = () => {
    const router = useRouter();

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
                            <Feather name="x" size={24} color="#4f46e5" />
                        </TouchableOpacity>
                    ),
                }} 
            />
        </Stack>
    );
};

export default GroupEditLayout;