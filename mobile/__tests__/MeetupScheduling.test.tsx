import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import DashboardScreen from '../app/(tabs)/index';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// 1. Double-layered Clerk protection
jest.mock('@clerk/expo', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: jest.fn(() => Promise.resolve('mock-token')) }),
}));

jest.mock('@clerk/react', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: jest.fn(() => Promise.resolve('mock-token')) }),
}));

// 2. Mock Expo Router behavior context variables safely
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useFocusEffect: (callback: Function) => callback(),
}));

// 3. Mock Vector Icons to prevent font loading sync state warnings
jest.mock('@expo/vector-icons', () => ({
  Feather: () => 'Icon',
}));

// 4. Force Mock React Query's base hook to deliver an instantaneous authenticated user context
jest.mock('@tanstack/react-query', () => {
  const original = jest.requireActual('@tanstack/react-query');
  return {
    ...original,
    useQuery: jest.fn(() => ({
      data: { _id: 'usr_999', firstName: 'Dallin', lastName: 'Hull', username: 'dhull', email: 'test@wgu.edu' },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })),
  };
});

// 5. Mock structural meetup state objects mimicking your MongoDB collection parameters
jest.mock('@/hooks/useGetMeetups', () => ({
  useGetMeetups: () => ({
    data: [
      {
        _id: 'mt_500',
        name: 'Saturday Run',
        date: new Date(Date.now() + 86400000).toISOString(), // Future Date
        time: '09:00 AM',
        timezone: 'America/Denver',
        status: 'scheduled',
        in: [],
        out: [],
        undecided: [], // Clear out usr_999 from undecided to prevent duplicate feed rendering!
        waitlist: [],
        capacity: 0
      }
    ],
    isLoading: false,
    isError: false,
    refetch: jest.fn()
  })
}));

jest.mock('@/hooks/useRsvp', () => ({ useRsvp: () => ({ mutate: jest.fn(), isPending: false }) }));

const createTestQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: { retry: false, gcTime: 0, staleTime: Infinity },
  },
});

describe('GroupThat Event Lifecycle & Response Validation Suite', () => {
  it('should separate active meetups and evaluate standard reservation attributes dynamically', async () => {
    const queryClient = createTestQueryClient();
    
    const { getByText } = render(
      <QueryClientProvider client={queryClient}>
        <DashboardScreen />
      </QueryClientProvider>
    );
    
    await waitFor(() => {
      expect(getByText('Saturday Run')).toBeTruthy();
      expect(getByText('Max Attendees: Unlimited')).toBeTruthy();
    });
  });
});