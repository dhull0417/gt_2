import { Stack } from 'expo-router';
import React from 'react';

const EventEditLayout = () => {
    return (
        <Stack>
            <Stack.Screen 
                name="[id]" 
                options={{ 
                    headerTitle: 'Edit Event',
                    presentation: 'modal',
                }} 
            />
        </Stack>
    );
};

export default EventEditLayout;