// app/(tabs)/_layout.tsx
import React from 'react';
import { Redirect } from 'expo-router';
import { NativeTabs, Icon, Label, VectorIcon } from 'expo-router/unstable-native-tabs';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@clerk/expo';

const TabsLayout = () => {
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
    <NativeTabs
      tintColor="#4A90E2"
      indicatorColor="#4A90E2"
      rippleColor="rgba(74, 144, 226, 0.15)"
      labelVisibilityMode="unlabeled"
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
