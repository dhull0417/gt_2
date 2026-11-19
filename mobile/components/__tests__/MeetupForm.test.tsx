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
  it('create mode shows the schedule-style sections and Create Meetup', () => {
    setup();
    expect(screen.getByText('Add Meetup')).toBeTruthy();
    for (const t of ['Description', 'Where', 'When', 'RSVP Rules', 'Capacity', 'Premium']) expect(screen.getByText(t)).toBeTruthy();
    expect(screen.getByText('Create Meetup')).toBeTruthy();
  });

  it('edit mode says Save and that changes are for this meetup only', () => {
    setup({ mode: 'edit' });
    expect(screen.getByText('Edit Meetup')).toBeTruthy();
    expect(screen.getByText('Changes apply to this meetup only')).toBeTruthy();
    expect(screen.getByText('Save')).toBeTruthy();
  });

  it('a draft problem blocks saving and says why', () => {
    const { onSubmit } = setup({}, { ...draftForNew(undefined, '2099-01-05'), maxAttendeesMode: 'limited', maxAttendeesInput: '' });
    expect(screen.getByText('How many people can come?')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Create Meetup'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('a valid draft submits', () => {
    const { onSubmit } = setup();
    fireEvent.press(screen.getByLabelText('Create Meetup'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('Limit RSVPs updates the draft', () => {
    const { onChange } = setup();
    fireEvent.press(screen.getByText('Limit RSVPs'));
    expect(onChange).toHaveBeenCalledWith({ rsvpRestricted: true });
  });

  it('RSVP Questions waits until the meetup exists', () => {
    setup();
    fireEvent.press(screen.getByText('Premium'));
    expect(screen.getByText('Set up after the meetup is created.')).toBeTruthy();
  });

  it('RSVP Questions opens the questions for an existing meetup', () => {
    const questionsLink = jest.fn();
    setup({ mode: 'edit', questionsLink });
    fireEvent.press(screen.getByText('Premium'));
    fireEvent.press(screen.getByLabelText('RSVP Questions'));
    expect(questionsLink).toHaveBeenCalledTimes(1);
  });
});
