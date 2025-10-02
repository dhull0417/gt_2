import React from 'react';
import { Redirect, Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { useQuery } from '@tanstack/react-query';
import { User, useApiClient, userApi } from '@/utils/api';
import { View, ActivityIndicator } from 'react-native';

const TabsLayout = () => {
  const insets = useSafeAreaInsets();
  const { isLoaded, isSignedIn } = useAuth();
  const api = useApiClient();

  const { data: currentUser, isSuccess } = useQuery<User, Error>({
    queryKey: ['currentUser'],
    queryFn: () => userApi.getCurrentUser(api),
    enabled: !!isSignedIn,
  });

  if (!isLoaded || (isSignedIn && !isSuccess)) {
    if (isSignedIn) {
      return (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="large" />
          </View>
      );
    }
    return null;
  }

  if (!isSignedIn) {
    return <Redirect href="/(auth)" />;
  }

  if (currentUser && (!currentUser.firstName?.trim() || !currentUser.lastName?.trim())) {
    return <Redirect href="/profile-setup" />;
  }

  return (
    <Tabs
        screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: "#4f46e5",
            tabBarInactiveTintColor: "#6b7280",
            tabBarStyle: { height: 50 + insets.bottom },
            tabBarShowLabel: false,
        }}
    >
      <Tabs.Screen 
          name='index'
          options={{
              title: "Home",
              tabBarIcon: ({color, size}) => <Feather name='home' size={size} color={color}/>
          }}
      />
      <Tabs.Screen 
          name='groups'
          options={{
              title: "Groups",
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
      {/* --- ADDED: The new Notifications tab --- */}
      <Tabs.Screen 
          name='notifications'
          options={{
              title: "Notifications",
              tabBarIcon: ({color, size}) => <Feather name='mail' size={size} color={color}/>
          }}
      />
      <Tabs.Screen 
          name='profile'
          options={{
              title: "Profile",
              tabBarIcon: ({color, size}) => <Feather name='user' size={size} color={color}/>
          }}
      />
    </Tabs>
  );
};

export default TabsLayout;