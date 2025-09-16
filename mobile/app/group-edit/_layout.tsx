import { Stack } from 'expo-router';
import React from 'react';

const GroupEditLayout = () => {
    return (
        <Stack>
            <Stack.Screen 
                name="[id]" 
                options={{ 
                    headerTitle: 'Edit Group',
                    headerBackTitle: 'Details',
                    presentation: 'modal',
                }} 
            />
        </Stack>
    );
};

export default GroupEditLayout;