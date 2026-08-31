import React from 'react';
import { Platform } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { NativeTabs, Icon, Label, VectorIcon } from 'expo-router/unstable-native-tabs';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@clerk/expo';
import { AndroidTabBar } from '@/components/AndroidTabBar';

const TabsLayout = () => {
  const { isLoaded, isSignedIn } = useAuth();

  // Show nothing until Clerk is ready
  if (!isLoaded) {
    return null;
  }

  if (!isSignedIn) {
    return <Redirect href="/(auth)" />;
  }

  // Android's NativeTabs draws a static Material 3 pill that can't be animated from JS,
  // so use a custom tab bar there for the tint/grow effect; iOS keeps native tabs.
  if (Platform.OS === 'android') {
    return (
      <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <AndroidTabBar {...props} />}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="groups" />
        <Tabs.Screen name="profile" />
      </Tabs>
    );
  }

  return (
    <NativeTabs
      tintColor="#4A90E2"
      indicatorColor="#4A90E2"
      rippleColor="rgba(74, 144, 226, 0.15)"
      labelVisibilityMode="unlabeled"
      blurEffect="none"
      backgroundColor="white"
      disableTransparentOnScrollEdge
    >
      <NativeTabs.Trigger name="index">
        <Icon
          sf={{ default: 'house', selected: 'house.fill' }}
          androidSrc={<VectorIcon family={Feather} name="home" />}
        />
        <Label hidden>Home</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="groups">
        <Icon
          sf={{ default: 'person.3', selected: 'person.3.fill' }}
          androidSrc={<VectorIcon family={Feather} name="users" />}
        />
        <Label hidden>Groups</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <Icon
          sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }}
          androidSrc={<VectorIcon family={Feather} name="user" />}
        />
        <Label hidden>Profile</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
};

export default TabsLayout;
