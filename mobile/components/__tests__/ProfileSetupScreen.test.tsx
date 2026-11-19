import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import ProfileSetupScreen from '@/app/profile-setup';
import { userApi } from '@/utils/api';

jest.mock('@/contexts/AppearanceContext', () => {
  const { lightColors } = jest.requireActual('@/constants/theme');
  return { useThemeColors: () => lightColors, useAppearance: () => ({ scheme: 'light' }) };
});
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: mockReplace }),
  useFocusEffect: jest.fn(),
}));
const mockSignOut = jest.fn();
let mockClerkUser: any = { firstName: 'Sam', lastName: 'Lee', externalAccounts: [{ provider: 'oauth_google' }] };
jest.mock('@clerk/expo', () => ({
  useUser: () => ({ user: mockClerkUser }),
  useAuth: () => ({ signOut: mockSignOut }),
}));
let mockCurrentUser: any;
const mockClear = jest.fn();
jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: mockCurrentUser }),
  useQueryClient: () => ({ setQueryData: jest.fn(), invalidateQueries: jest.fn(), clear: mockClear }),
}));
jest.mock('@/utils/api', () => ({
  useApiClient: () => ({}),
  userApi: {
    syncUser: jest.fn().mockResolvedValue({}),
    updateProfile: jest.fn().mockResolvedValue({ data: { user: { _id: 'u1' } } }),
    getCurrentUser: jest.fn(),
  },
}));
jest.mock('@/utils/pendingInvite', () => ({ openPendingInvite: jest.fn().mockResolvedValue(false) }));
jest.mock('@/hooks/usePushNotifications', () => ({ unregisterPushToken: jest.fn().mockResolvedValue(undefined) }));

describe('Profile setup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockClerkUser = { firstName: 'Sam', lastName: 'Lee', externalAccounts: [{ provider: 'oauth_google' }] };
    mockCurrentUser = undefined;
  });

  it('prefills the name and saves name and zip, then opens the app', async () => {
    render(<ProfileSetupScreen />);
    expect(screen.getByLabelText('First name').props.value).toBe('Sam');
    fireEvent.changeText(screen.getByLabelText('Zip code'), '84 060x');
    fireEvent.press(screen.getByText('Save & continue'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(tabs)'));
    expect(userApi.updateProfile).toHaveBeenCalledWith({}, { firstName: 'Sam', lastName: 'Lee', zipCode: '84060' });
  });

  it('requires a 5-digit zip code', () => {
    render(<ProfileSetupScreen />);
    fireEvent.changeText(screen.getByLabelText('Zip code'), '123');
    fireEvent.press(screen.getByText('Save & continue'));
    expect(Alert.alert).toHaveBeenCalledWith('Zip Code Needed', expect.any(String));
    expect(userApi.updateProfile).not.toHaveBeenCalled();
  });

  it('lets an Apple user with no name add one, without requiring it', async () => {
    mockClerkUser = { externalAccounts: [{ provider: 'oauth_apple' }] };
    mockCurrentUser = { firstName: '', lastName: '' };
    render(<ProfileSetupScreen />);
    expect(screen.getByText(/Add your name/)).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Zip code'), '84060');
    fireEvent.press(screen.getByText('Save & continue'));
    await waitFor(() => expect(userApi.updateProfile).toHaveBeenCalledWith({}, { zipCode: '84060' }));
  });

  it('hides the name fields for an Apple user who already has a name', () => {
    mockClerkUser = { externalAccounts: [{ provider: 'oauth_apple' }] };
    mockCurrentUser = { firstName: 'Sam', lastName: 'Lee' };
    render(<ProfileSetupScreen />);
    expect(screen.queryByLabelText('First name')).toBeNull();
  });

  it('signs out from setup', async () => {
    render(<ProfileSetupScreen />);
    fireEvent.press(screen.getByLabelText('Sign out'));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
    expect(mockClear).toHaveBeenCalled();
  });
});
