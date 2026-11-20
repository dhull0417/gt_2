import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { MeetupForm } from '../meetup-form/MeetupForm';
import { draftForNew, type MeetupDraft } from '@/utils/meetupFormDraft';

jest.mock('@/contexts/AppearanceContext', () => {
  const { lightColors } = jest.requireActual('@/constants/theme');
  return { useThemeColors: () => lightColors, useAppearance: () => ({ scheme: 'light' }) };
});
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('@/components/UpgradeButton', () => ({ UpgradeButton: () => null }));
jest.mock('@/components/LocationSearchModal', () => () => null);
jest.mock('@/components/NativeTimePicker', () => () => null);

const setup = (over: Partial<React.ComponentProps<typeof MeetupForm>> = {}, draft: MeetupDraft = draftForNew(undefined, '2099-01-05')) => {
  const onSubmit = jest.fn();
  const onChange = jest.fn();
  render(
    <MeetupForm
      visible mode="create" draft={draft} onChange={onChange} isPremium owner="u1" lockedNote="Get Premium."
      timezoneEditable saving={false} onSubmit={onSubmit} onClose={() => {}} {...over}
    />,
  );
  return { onSubmit, onChange };
};

describe('MeetupForm', () => {
  it('create mode shows calm sections of summary rows and Create Meetup', () => {
    setup();
    expect(screen.getByText('Add Meetup')).toBeTruthy();
    for (const t of ['When', 'Timezone', 'RSVP rules', 'Capacity', 'Food/Things to bring', 'Rides', 'RSVP Questions']) expect(screen.getByText(t)).toBeTruthy();
    expect(screen.getByPlaceholderText('Add any extra details for this meetup...')).toBeTruthy();
    expect(screen.getByText('Create Meetup')).toBeTruthy();
  });

  it('edit mode says Save, and the timezone is fixed', () => {
    setup({ mode: 'edit', timezoneEditable: false });
    expect(screen.getByText('Edit Meetup')).toBeTruthy();
    expect(screen.getByText('Changes apply to this meetup only')).toBeTruthy();
    expect(screen.getByText('Save')).toBeTruthy();
    expect(screen.getByText("Set by the group")).toBeTruthy();
  });

  it('a fresh form shows no problems', () => {
    setup();
    expect(screen.queryByText(/Fix \d/)).toBeNull();
  });

  it('missing info waits for Create, then blocks it and says exactly what to fix', () => {
    const { onSubmit } = setup({}, { ...draftForNew(undefined, '2099-01-05'), maxAttendeesMode: 'limited', maxAttendeesInput: '' });
    expect(screen.queryByText('Enter how many people can come')).toBeNull();
    fireEvent.press(screen.getByLabelText('Create Meetup'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Fix 1 thing above')).toBeTruthy();
    expect(screen.getByText('Enter how many people can come')).toBeTruthy();
  });

  it('wrong input shows right away', () => {
    setup({}, { ...draftForNew(undefined, '2099-01-05'), maxAttendeesMode: 'limited', maxAttendeesInput: '0' });
    expect(screen.getByText('Enter a number between 1 and 200.')).toBeTruthy();
  });

  it('a valid draft submits', () => {
    const { onSubmit } = setup();
    fireEvent.press(screen.getByLabelText('Create Meetup'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('RSVP rules opens its sheet; Set a window updates the draft', () => {
    const { onChange } = setup();
    fireEvent.press(screen.getByText('RSVP rules'));
    fireEvent.press(screen.getByTestId('rsvp-limit'));
    expect(onChange).toHaveBeenCalledWith({ rsvpRestricted: true });
  });

  it('RSVP Questions can be written while adding the meetup', () => {
    const { onChange } = setup();
    fireEvent.press(screen.getByText('RSVP Questions'));
    fireEvent.press(screen.getByText('Add question'));
    expect(onChange.mock.calls[0][0].questions).toHaveLength(1);
  });

  it('RSVP Questions opens the questions for an existing meetup', () => {
    const questionsLink = jest.fn();
    setup({ mode: 'edit', questionsLink });
    fireEvent.press(screen.getByText('RSVP Questions'));
    expect(questionsLink).toHaveBeenCalledTimes(1);
  });

  it('without Premium, premium rows are locked', () => {
    setup({ isPremium: false });
    expect(screen.getAllByTestId('row-lock').length).toBeGreaterThanOrEqual(2);
  });
});
