import React from 'react';
import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TabsLayout = () => {
  const insets = useSafeAreaInsets();
  // All useAuth hooks and redirects have been removed.

  return (
    <Tabs
        screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: "#4f46e5",
            tabBarInactiveTintColor: "#6b7280",
            tabBarStyle: { height: 50 + insets.bottom },
        }}
    >
      <Tabs.Screen 
          name='index'
          options={{
              title:"",
              tabBarIcon: ({color, size}) => <Feather name='home' size={size} color={color}/>
          }}
      />
      <Tabs.Screen 
          name='groups'
          options={{
              title:"",
              tabBarIcon: ({color, size}) => <Feather name='users' size={size} color={color}/>
          }}
      />
      <Tabs.Screen 
        name='events'
        options={{
          title: 'Events',
          tabBarIcon: ({ color, size }) => <Feather name="calendar" size={size} color={color} />
        }}
      />
    </Tabs>
  );
};

export default TabsLayout;