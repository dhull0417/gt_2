import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import GroupScreen from '../app/(tabs)/groups';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// 1. Double-layered Clerk mock protection
jest.mock('@clerk/expo', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: jest.fn(() => Promise.resolve('mock-token')) }),
}));

jest.mock('@clerk/react', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: jest.fn(() => Promise.resolve('mock-token')) }),
}));

// 2. Mock Expo Router behavior context variables safely
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), setParams: jest.fn() }),
  useLocalSearchParams: () => ({ openChatId: undefined, reset: undefined }),
  useFocusEffect: (callback: Function) => callback(),
}));

// 3. Mock Vector Icons to prevent font loading async state warnings and open handle locks
jest.mock('@expo/vector-icons', () => ({
  Feather: () => 'Icon',
}));

// 4. Force Mock React Query's base hook to deliver an instantaneous authenticated user context
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

// 5. Mock your project's explicit domain data hooks
jest.mock('@/hooks/useGetGroups', () => ({
  useGetGroups: () => ({
    data: [{ _id: 'grp_100', name: 'Pick-up Basketball', lastMessage: { user: { name: 'Dallin' }, text: 'What time are we meeting?' } }],
    isLoading: false, 
    isError: false, 
    refetch: jest.fn()
  })
}));

jest.mock('@/hooks/useGetGroupDetails', () => ({ useGetGroupDetails: () => ({ data: null, isLoading: false, isError: false }) }));
jest.mock('@/hooks/useGetNotifications', () => ({ useGetNotifications: () => ({ data: [] }) }));
jest.mock('@/hooks/useSearchUsers', () => ({ useSearchUsers: () => ({ data: [] }) }));
jest.mock('@/hooks/useInviteUser', () => ({ useInviteUser: () => ({ mutate: jest.fn() }) }));
jest.mock('@/hooks/useRemoveMember', () => ({ useRemoveMember: () => ({ mutate: jest.fn(), isPending: false }) }));

// 6. Mock Stream Chat components
jest.mock('stream-chat-expo', () => ({
  Chat: ({ children }: any) => children,
  Channel: ({ children }: any) => children,
  MessageList: () => 'MessageList',
  OverlayProvider: ({ children }: any) => children,
}));

jest.mock('@/components/ChatProvider', () => ({
  ChatProvider: ({ children }: any) => children,
  useChatClient: () => ({ client: {}, isConnected: true }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const createTestQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: { retry: false, gcTime: 0, staleTime: Infinity },
  },
});

describe('GroupThat Structural Directory Validation Suite', () => {
  it('should render the group directory feed and present relational last message previews', async () => {
    const queryClient = createTestQueryClient();
    
    // Destructure getByText for our synchronous loop check
    const { getByText } = render(
      <QueryClientProvider client={queryClient}>
        <GroupScreen />
      </QueryClientProvider>
    );
    
    // Let waitFor handle the polling loop using standard synchronous checks
    await waitFor(() => {
      const groupCard = getByText('Pick-up Basketball');
      expect(groupCard).toBeTruthy();
    });
  });
});