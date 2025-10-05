import { Stack } from 'expo-router';
import React from 'react';

const GroupLayout = () => {
    return (
        <Stack>
            <Stack.Screen 
                name="[id]" 
                options={{ 
                    headerTitle: '', // The title will be set dynamically by the screen itself
                }} 
            />
        </Stack>
    );
};

export default GroupLayout;