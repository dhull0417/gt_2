import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { VerificationCodeForm } from '../auth/VerificationCodeForm';

jest.mock('@/contexts/AppearanceContext', () => {
  const { lightColors } = jest.requireActual('@/constants/theme');
  return { useThemeColors: () => lightColors, useAppearance: () => ({ scheme: 'light' }) };
});

describe('VerificationCodeForm', () => {
  it('only submits once the code is long enough', () => {
    const onSubmit = jest.fn();
    render(<VerificationCodeForm destination="sam@x.com" onSubmit={onSubmit} />);
    fireEvent.changeText(screen.getByLabelText('Verification code'), '12');
    fireEvent.press(screen.getByText('Verify'));
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByLabelText('Verification code'), '12a3456');
    fireEvent.press(screen.getByText('Verify'));
    expect(onSubmit).toHaveBeenCalledWith('123456');
  });

  it('shows its own heading by default and hides it inside a titled screen', () => {
    const { rerender } = render(<VerificationCodeForm destination="sam@x.com" onSubmit={jest.fn()} />);
    expect(screen.getByText('Check your email')).toBeTruthy();
    rerender(<VerificationCodeForm destination="+18015551234" onSubmit={jest.fn()} showHeading={false} />);
    expect(screen.queryByText('Check your messages')).toBeNull();
    expect(screen.getByText(/We sent a code to \+18015551234/)).toBeTruthy();
  });

  it('offers resend after the cooldown only when there is a resend handler', () => {
    render(<VerificationCodeForm destination="sam@x.com" onSubmit={jest.fn()} />);
    expect(screen.queryByText(/Resend/)).toBeNull();
  });

  it('keeps resend available when a resend fails', async () => {
    jest.useFakeTimers();
    try {
      const onResend = jest.fn().mockResolvedValue(false);
      render(<VerificationCodeForm destination="sam@x.com" onSubmit={jest.fn()} onResend={onResend} />);
      for (let i = 0; i < 31; i++) await act(async () => { jest.advanceTimersByTime(1000); });
      fireEvent.press(screen.getByText('Resend code'));
      await act(async () => {});
      expect(onResend).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Resend code')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('pasting a code', () => {
  it('leaves the text field in charge of its own text, so a paste is never rolled back', () => {
    render(<VerificationCodeForm destination="sam@x.com" onSubmit={jest.fn()} />);
    // A controlled field (value=...) echoes each change back; on iOS a paste arrives as several
    // quick changes and a late echo can overwrite it, leaving one digit.
    expect(screen.getByLabelText('Verification code').props.value).toBeUndefined();
  });

  it('submits just the digits from pasted text', () => {
    const onSubmit = jest.fn();
    render(<VerificationCodeForm destination="sam@x.com" onSubmit={onSubmit} />);
    fireEvent.changeText(screen.getByLabelText('Verification code'), 'Code: 123 456');
    fireEvent.press(screen.getByText('Verify'));
    expect(onSubmit).toHaveBeenCalledWith('123456');
  });
});
