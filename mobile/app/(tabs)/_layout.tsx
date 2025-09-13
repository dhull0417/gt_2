import React from 'react';
import { Redirect, Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { useQuery } from '@tanstack/react-query';
import { User, useApiClient, userApi } from '@/utils/api';
import { ActivityIndicator, View } from 'react-native';

const TabsLayout = () => {
  const insets = useSafeAreaInsets();
  const { isLoaded, isSignedIn } = useAuth();
  const api = useApiClient();

  // Fetch the user's profile from our database
  const { data: currentUser, isSuccess } = useQuery<User, Error>({
    queryKey: ['currentUser'],
    queryFn: () => userApi.getCurrentUser(api),
    enabled: !!isSignedIn, // Only run if signed in
  });

  // Wait until both Clerk and our user profile are loaded
  if (!isLoaded || !isSuccess) {
      // If the user is signed in but the profile hasn't loaded, show a spinner
      if (isSignedIn) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" />
            </View>
        );
      }
      return null;
  }

  // If the user is not signed in, redirect them to the auth flow.
  if (!isSignedIn) {
    return <Redirect href="/(auth)" />;
  }

  // If the user is signed in but their profile is incomplete, redirect them to the setup screen.
  if (currentUser && (!currentUser.firstName || !currentUser.lastName)) {
    return <Redirect href="/profile-setup" />;
  }

  // If all checks pass, render the main tabs.
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