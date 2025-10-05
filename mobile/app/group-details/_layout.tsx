import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';

const GroupDetailsLayout = () => {
    const router = useRouter();
    return (
        <Stack>
            <Stack.Screen 
                name="[id]" 
                options={{ 
                    headerTitle: 'Group Details',
                    presentation: 'modal',
                    headerLeft: () => (
                        <TouchableOpacity onPress={() => router.back()}>
                            <Feather name="x" size={24} color="#4f46e5" style={{ marginLeft: 10 }}/>
                        </TouchableOpacity>
                    ),
                }} 
            />
        </Stack>
    );
};

export default GroupDetailsLayout;