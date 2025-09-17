import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';

const ScheduleEventLayout = () => {
    const router = useRouter();

    return (
        <Stack>
            <Stack.Screen 
                name="[group-id]" 
                options={{ 
                    headerTitle: 'Schedule One-Off Event',
                    presentation: 'modal',
                    // --- ADDED: Custom header button ---
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

export default ScheduleEventLayout;