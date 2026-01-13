import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';

const CreateGroupLayout = () => {
    const router = useRouter();
    
    return (
        <Stack>
            <Stack.Screen 
                name="index" 
                options={{ 
                    presentation: 'card', // This makes it a standard full-screen push
                headerShown: false,
                gestureEnabled: false, // This explicitly disables the swipe-back gesture
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

export default CreateGroupLayout;