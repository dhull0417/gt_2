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
                    presentation: 'card', // full-screen push
                headerShown: false,
                gestureEnabled: false, // disable swipe-back
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

export default CreateGroupLayout;