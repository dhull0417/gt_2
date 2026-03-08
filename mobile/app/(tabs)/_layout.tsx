// app/(tabs)/_layout.tsx
import React from 'react';
import { Tabs, Redirect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';

const TabsLayout = () => {
  const insets = useSafeAreaInsets();
  const { isLoaded, isSignedIn } = useAuth();

  // Show nothing until Clerk is ready
  if (!isLoaded) {
    return null; // or <></>
  }

  // Optional: Redirect if not signed in (adjust as needed)
  if (!isSignedIn) {
    return <Redirect href="/(auth)" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#4A90E2',
        tabBarInactiveTintColor: '#6b7280',
        tabBarStyle: { height: 50 + insets.bottom },
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="index"
        // Reset the nested stack within the tab to the 'index' screen
        // If the screen is already active, this forces it to pop to the top
        // This ensures tapping the tab always brings you to the root of that tab.
        listeners={({ navigation }: { navigation: any }) => ({
          tabPress: (e: any) => {
            e.preventDefault(); // Prevent default behavior to handle navigation manually
            // By navigating to the tab's name, we trigger the default behavior
            // which is to go to the initial screen of the stack. If the tab is
            // already active, it will pop the stack to the top. This directs the
            // user to `app/(tabs)/index.tsx`.
            navigation.navigate('index');
          },
        })}
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Feather name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="groups"
        // The listeners prop must be a direct child of Tabs.Screen (not inside options)
        // This ensures tapping the tab always brings you to the root of that tab.
        listeners={({ navigation }: { navigation: any }) => ({
          tabPress: (e: any) => {
            e.preventDefault(); // Prevent default behavior to handle navigation manually
            // By navigating to the tab's name, we trigger the default behavior
            // which is to go to the initial screen of the stack. If the tab is
            // already active, it will pop the stack to the top. This directs the
            // user to `app/(tabs)/groups.tsx`.
            navigation.navigate('groups');
          },
        })}
        options={{
          title: 'Groups',
          tabBarIcon: ({ color, size }) => <Feather name="users" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        // Reset the nested stack within the tab to the 'index' screen
        // If the screen is already active, this forces it to pop to the top
        // This ensures tapping the tab always brings you to the root of that tab.
        listeners={({ navigation }: { navigation: any }) => ({
          tabPress: (e: any) => {
            e.preventDefault(); // Prevent default behavior to handle navigation manually
            // By navigating to the tab's name, we trigger the default behavior
            // which is to go to the initial screen of the stack. If the tab is
            // already active, it will pop the stack to the top. This directs the
            // user to `app/(tabs)/profile.tsx`.
            navigation.navigate('profile');
          },
        })}
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <Feather name="user" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
};

export default TabsLayout;