import React from 'react'
import { Redirect, Tabs } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '@clerk/clerk-expo'

const TabsLayout = () => {
const insets = useSafeAreaInsets(); // So tab bar isn't covered by action bar or other phone provider unique feature(i.e. "safe area")

const { isLoaded, isSignedIn } = useAuth();
if (!isLoaded) return null;
if (!isSignedIn) return <Redirect href="/(auth)" />;

  return (
    <Tabs
        screenOptions={{
            tabBarActiveTintColor: "#1DA1F2",
            tabBarInactiveTintColor: "#657786",
            tabBarStyle: {
                backgroundColor: "#fff",
                borderTopWidth: 1,
                borderTopColor: "#E1E8ED",
                height: 50 + insets.bottom, //inset implementation
                paddingTop: 8,
            },
            tabBarLabelStyle: { //in case of text (none here)
                fontSize: 25,
                fontWeight: "500"
            },
            headerShown: false,
        }}
    >
        <Tabs.Screen 
            name='index'
            options={{
                title:"",
                tabBarIcon: ({color, size}) =>  <Feather name='home' size={size} color={color}/>
            }}
        />
        <Tabs.Screen 
            name='search'
            options={{
                title:"",
                tabBarIcon: ({color, size}) =>  <Feather name='search' size={size} color={color}/>
            }}
        />
        <Tabs.Screen 
            name='notifications'
            options={{
                title:"",
                tabBarIcon: ({color, size}) =>  <Feather name='bell' size={size} color={color}/>
            }}
        />
        <Tabs.Screen 
            name='messages'
            options={{
                title:"",
                tabBarIcon: ({color, size}) =>  <Feather name='mail' size={size} color={color}/>
            }}
        />
        <Tabs.Screen 
            name='profile'
            options={{
                title:"",
                tabBarIcon: ({color, size}) =>  <Feather name='user' size={size} color={color}/>
            }}
        />

    </Tabs>
  )
}

export default TabsLayout