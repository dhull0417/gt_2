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
                    headerTitle: 'Create Group',
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

export default CreateGroupLayout;