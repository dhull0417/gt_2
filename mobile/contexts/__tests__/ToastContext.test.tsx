import React from 'react';
import { View } from 'react-native';
import { render, act, within, screen } from '@testing-library/react-native';
import { ToastProvider, ToastPortal, toast } from '../ToastContext';

jest.mock('@/contexts/AppearanceContext', () => ({
  useThemeColors: () => ({ danger: 'red', brand: 'blue', success: 'green', textPrimary: '#000', background: '#fff' }),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/utils/haptics', () => ({ haptic: { error: jest.fn(), success: jest.fn() } }));

// A React Native <Modal> is its own native window above the app, so a toast drawn at the app root
// is hidden behind it. Screens put a <ToastPortal /> inside their Modal; the toast must go there.
function App({ modalOpen }: { modalOpen: boolean }) {
  return (
    <ToastProvider>
      <View testID="screen" />
      {modalOpen && (
        <View testID="modal">
          <ToastPortal />
        </View>
      )}
    </ToastProvider>
  );
}

describe('ToastPortal', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('shows the toast inside the open modal, not behind it', () => {
    render(<App modalOpen />);
    act(() => { toast.error("You're offline."); });
    expect(within(screen.getByTestId('modal')).getByText("You're offline.")).toBeTruthy();
    expect(screen.getAllByText("You're offline.")).toHaveLength(1);
  });

  it('falls back to the app root once the modal closes', () => {
    const r = render(<App modalOpen />);
    r.rerender(<App modalOpen={false} />);
    act(() => { toast.error('Saved.'); });
    expect(screen.getAllByText('Saved.')).toHaveLength(1);
  });
});
