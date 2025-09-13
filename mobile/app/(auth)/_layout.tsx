import { Stack } from 'expo-router';
import React from 'react';

// This layout is now "dumb". It only provides the navigation stack.
export default function AuthRoutesLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}