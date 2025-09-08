// mobile/components/GroupList.tsx
import React from 'react';
import { View, Text, FlatList, ActivityIndicator } from 'react-native';
import { Group } from '../hooks/useGetGroups'; // Import the type

interface GroupListProps {
  groups: Group[] | undefined;
  isLoading: boolean;
}

const WEEK_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// A helper function to format the schedule into a human-readable string
const formatSchedule = (schedule: Group['schedule']) => {
    const { frequency, day, time } = schedule;
    
    // Convert HH:mm to AM/PM format
    const [hour, minute] = time.split(':').map(Number);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const formattedHour = hour % 12 || 12; // Convert 0 to 12 for 12 AM
    const formattedTime = `${formattedHour}:${minute.toString().padStart(2, '0')} ${ampm}`;

    if (frequency === 'weekly') {
        const dayOfWeek = WEEK_DAYS[day];
        return `Meets weekly on ${dayOfWeek}s at ${formattedTime}`;
    } else {
        // Add suffix to day of month (1st, 2nd, 3rd, 4th...)
        const suffix = ["th", "st", "nd", "rd"][day % 100 > 3 && day % 100 < 21 ? 0 : (day % 10 < 4 ? day % 10 : 0)];
        return `Meets monthly on the ${day}${suffix} at ${formattedTime}`;
    }
};

const GroupCard = ({ group }: { group: Group }) => (
    <View className="bg-white p-4 rounded-lg shadow-md mb-4">
        <Text className="text-lg font-bold text-gray-800">{group.name}</Text>
        <Text className="text-gray-600 mt-1">{formatSchedule(group.schedule)}</Text>
    </View>
);

export const GroupList = ({ groups, isLoading }: GroupListProps) => {
  if (isLoading) {
    return <ActivityIndicator size="large" color="#0000ff" className="mt-10" />;
  }

  if (!groups || groups.length === 0) {
    return (
      <View className="mt-10 items-center">
        <Text className="text-gray-500">No groups yet. Create one to get started!</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={groups}
      keyExtractor={(item) => item._id}
      renderItem={({ item }) => <GroupCard group={item} />}
      className="mt-6"
    />
  );
};