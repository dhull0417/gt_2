import React from 'react';
import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { View, ActivityIndicator } from 'react-native';

const TabsLayout = () => {
  const insets = useSafeAreaInsets();
  const { isLoaded } = useAuth();

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
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