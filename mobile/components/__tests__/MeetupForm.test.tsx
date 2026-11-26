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
let mockOwner = true;
const mockPush = jest.fn();
jest.mock('@/hooks/useIsGroupOwner', () => ({ useIsGroupOwner: () => mockOwner }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/components/LocationSearchModal', () => () => null);
jest.mock('@/components/NativeTimePicker', () => () => null);

const setup = async (over: Partial<React.ComponentProps<typeof MeetupForm>> = {}, draft: MeetupDraft = draftForNew(undefined, '2099-01-05')) => {
  const onSubmit = jest.fn();
  const onChange = jest.fn();
  await render(
    <MeetupForm
      visible mode="create" draft={draft} onChange={onChange} isPremium owner="u1" lockedNote="Get Premium."
      timezoneEditable saving={false} onSubmit={onSubmit} onClose={() => {}} {...over}
    />,
  );
  return { onSubmit, onChange };
};

describe('MeetupForm', () => {
  it('create mode shows calm sections of summary rows and Create Meetup', async () => {
    await setup();
    expect(screen.getByText('Add Meetup')).toBeTruthy();
    for (const t of ['When', 'Timezone', 'RSVP rules', 'Capacity', 'Food/Things to bring', 'Rides', 'RSVP Questions']) expect(screen.getByText(t)).toBeTruthy();
    expect(screen.getByPlaceholderText('Add any extra details for this meetup...')).toBeTruthy();
    expect(screen.getByText('Create Meetup')).toBeTruthy();
  });

  it('edit mode says Save, and the timezone is fixed', async () => {
    await setup({ mode: 'edit', timezoneEditable: false });
    expect(screen.getByText('Edit Meetup')).toBeTruthy();
    expect(screen.getByText('Changes apply to this meetup only')).toBeTruthy();
    expect(screen.getByText('Save')).toBeTruthy();
    expect(screen.getByText("Set by the group")).toBeTruthy();
  });

  it('a fresh form shows no problems', async () => {
    await setup();
    expect(screen.queryByText(/Fix \d/)).toBeNull();
  });

  it('missing info waits for Create, then blocks it and says exactly what to fix', async () => {
    const { onSubmit } = await setup({}, { ...draftForNew(undefined, '2099-01-05'), maxAttendeesMode: 'limited', maxAttendeesInput: '' });
    expect(screen.queryByText('Enter how many people can come')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Create Meetup'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Fix 1 thing above')).toBeTruthy();
    expect(screen.getByText('Enter how many people can come')).toBeTruthy();
  });

  it('wrong input shows right away', async () => {
    await setup({}, { ...draftForNew(undefined, '2099-01-05'), maxAttendeesMode: 'limited', maxAttendeesInput: '0' });
    expect(screen.getByText('Enter a number between 1 and 200.')).toBeTruthy();
  });

  it('a valid draft submits', async () => {
    const { onSubmit } = await setup();
    await fireEvent.press(screen.getByLabelText('Create Meetup'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('RSVP rules opens its sheet; Set a window updates the draft', async () => {
    const { onChange } = await setup();
    await fireEvent.press(screen.getByText('RSVP rules'));
    await fireEvent.press(screen.getByTestId('rsvp-limit'));
    expect(onChange).toHaveBeenCalledWith({ rsvpRestricted: true });
  });

  it('RSVP Questions can be written while adding the meetup', async () => {
    const { onChange } = await setup();
    await fireEvent.press(screen.getByText('RSVP Questions'));
    await fireEvent.press(screen.getByText('Add question'));
    expect(onChange.mock.calls[0][0].questions).toHaveLength(1);
  });

  it('RSVP Questions opens the questions for an existing meetup', async () => {
    const questionsLink = jest.fn();
    await setup({ mode: 'edit', questionsLink });
    await fireEvent.press(screen.getByText('RSVP Questions'));
    expect(questionsLink).toHaveBeenCalledTimes(1);
  });

});

describe('MeetupForm without Premium', () => {
  const rides = { ...draftForNew(undefined, '2099-01-05'), ridesEnabled: true };
  beforeEach(() => { mockOwner = true; mockPush.mockClear(); });

  it('Premium rows are open to set up when adding a meetup', async () => {
    const { onChange } = await setup({ isPremium: false });
    expect(screen.queryAllByTestId('row-lock').length).toBe(0);
    await fireEvent.press(screen.getByText('RSVP Questions'));
    await fireEvent.press(screen.getByText('Add question'));
    expect(onChange.mock.calls[0][0].questions).toHaveLength(1);
    expect(screen.getByText('Set these up now. Premium is needed to save them.')).toBeTruthy();
  });

  it('with no Premium feature in use, Create Meetup works as normal', async () => {
    const { onSubmit } = await setup({ isPremium: false });
    await fireEvent.press(screen.getByLabelText('Create Meetup'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('owner: a Premium feature in use turns Create Meetup into Premium, which opens the paywall', async () => {
    const { onSubmit } = await setup({ isPremium: false }, rides);
    expect(screen.queryByLabelText('Create Meetup')).toBeNull();
    expect(screen.getByText('Premium is needed to save these settings.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Premium'));
    expect(mockPush).toHaveBeenCalledWith('/paywall');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('non-owner: the button is a disabled Owner needs Premium', async () => {
    mockOwner = false;
    const { onSubmit } = await setup({ isPremium: false }, rides);
    expect(screen.getByText('The group owner needs Premium to save these settings.')).toBeTruthy();
    const btn = screen.getByLabelText('Owner needs Premium');
    expect(btn.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    await fireEvent.press(btn);
    expect(mockPush).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('a Premium group is unaffected: Create Meetup submits with rides on', async () => {
    const { onSubmit } = await setup({ isPremium: true }, rides);
    await fireEvent.press(screen.getByLabelText('Create Meetup'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('editing an unrelated field of a meetup that already has Premium settings still shows Save', async () => {
    const { onSubmit } = await setup({ isPremium: false, mode: 'edit', timezoneEditable: false }, rides);
    await fireEvent.press(screen.getByLabelText('Save'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('Premium')).toBeNull();
  });

  it('editing an existing meetup: RSVP Questions stays locked (it lives on its own screen)', async () => {
    await setup({ isPremium: false, mode: 'edit', questionsLink: jest.fn() });
    expect(screen.getAllByTestId('row-lock').length).toBe(1);
  });
});
