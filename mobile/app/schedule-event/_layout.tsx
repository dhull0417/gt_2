import { Stack } from 'expo-router';
import React from 'react';

const ScheduleEventLayout = () => {
    return (
        <Stack>
            <Stack.Screen 
                name="[groupId]" 
                options={{ 
                    headerTitle: 'Schedule One-Off Event',
                    presentation: 'modal',
                }} 
            />
        </Stack>
    );
};

export default ScheduleEventLayout;