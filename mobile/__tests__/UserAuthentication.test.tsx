import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import AuthIndexScreen from '../app/(auth)/index';
import ProfileHomeScreen from '../app/(tabs)/profile';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// 1. Double-layered Clerk base placeholder definition block
jest.mock('@clerk/expo', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, signOut: jest.fn() }),
}));

jest.mock('@clerk/react', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, signOut: jest.fn() }),
}));

// 2. STRIKE AT THE ROOT: Mock your custom hooks directly so Clerk code never runs during verification
jest.mock('@/hooks/useSocialAuth', () => ({
  useSocialAuth: () => ({ handleSocialAuth: jest.fn(), isLoading: false })
}));

jest.mock('@/hooks/useAppleAuth', () => ({
  useAppleAuth: () => ({ handleAppleAuth: jest.fn(), isLoading: false })
}));

// 3. Mock Expo Router behavior context variables safely
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), setParams: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: (callback: Function) => callback(),
}));

// 4. Mock Vector Icons to prevent font loading async state warnings
jest.mock('@expo/vector-icons', () => ({
  Feather: () => 'Icon',
}));

// 5. Mock the native apple button implementation wrapper
jest.mock('expo-apple-authentication', () => ({
  AppleAuthenticationButton: () => 'AppleAuthenticationButton',
  AppleAuthenticationButtonType: { CONTINUE: 'continue' },
  AppleAuthenticationButtonStyle: { BLACK: 'black' },
}));

// 6. Mock your project API context fetchers
jest.mock('@/utils/api', () => ({
  useApiClient: jest.fn(() => ({})),
  userApi: { getCurrentUser: jest.fn(() => Promise.resolve({})) },
}));

// 7. Mock React Query's base hook to deliver user context metrics along with refetch loops
jest.mock('@tanstack/react-query', () => {
  const original = jest.requireActual('@tanstack/react-query');
  return {
    ...original,
    useQuery: jest.fn(() => ({
      data: { _id: 'usr_999', firstName: 'Dallin', lastName: 'Hull', username: 'dhull', email: 'test@wgu.edu', mutedGroups: [] },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })),
  };
});

const createTestQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: { retry: false, gcTime: 0, staleTime: Infinity },
  },
});

describe('GroupThat User Baseline Validation Suite', () => {
  it('should cleanly verify and display all core authentication pathways on gateway initialization', async () => {
    const queryClient = createTestQueryClient();
    
    const { getByText } = render(
      <QueryClientProvider client={queryClient}>
        <AuthIndexScreen />
      </QueryClientProvider>
    );
    
    await waitFor(() => {
      expect(getByText('Continue with Google')).toBeTruthy();
      expect(getByText('Continue with Phone')).toBeTruthy();
      expect(getByText('Continue with Email')).toBeTruthy();
    });
  });

  it('should accurately paint mock user context parameters onto the Profile layout tree', async () => {
    const queryClient = createTestQueryClient();
    
    const { getByText } = render(
      <QueryClientProvider client={queryClient}>
        <ProfileHomeScreen />
      </QueryClientProvider>
    );
    
    await waitFor(() => {
      expect(getByText('Sync to My Calendar')).toBeTruthy();
    });
  });
});