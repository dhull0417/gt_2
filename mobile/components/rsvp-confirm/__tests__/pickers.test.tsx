import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { BringPicker, BringReview } from '../BringPicker';
import { RidePicker, RideReview } from '../RidePicker';
import { QuestionFields, QuestionsReview } from '../QuestionFields';

jest.mock('@/contexts/AppearanceContext', () => ({ useThemeColors: () => new Proxy({}, { get: () => '#888888' }) }));
jest.mock('@/utils/haptics', () => ({ haptic: new Proxy({}, { get: () => () => {} }) }));

const meetup: any = {
  _id: 'm1', name: 'Hike', group: { isPremium: true },
  members: [{ _id: 'u1', firstName: 'Ann' }, { _id: 'u2', firstName: 'Bo' }],
  in: ['u1', 'u2'], out: [], waitlist: [], guests: [],
  bringItems: [{ _id: 'i1', name: 'Chips' }, { _id: 'i2', name: 'Cooler', max: 1 }],
  ridesEnabled: true,
  questions: [
    { _id: 'q1', prompt: 'Diet?', type: 'text', options: [], required: false },
    { _id: 'q2', prompt: 'Bringing a dog?', type: 'yesno', options: [], required: false },
  ],
  bringClaims: [{ user: 'u2', item: 'i1' }, { user: 'u2', item: 'i2' }],
  rides: [{ user: 'u2', role: 'passenger' }],
  answers: [{ user: 'u2', question: 'q1', value: 'Vegan' }],
};

describe('BringPicker', () => {
  it('toggles an item', async () => {
    const onToggle = jest.fn();
    await render(<BringPicker meetup={meetup} userId="u1" selected={[]} onToggle={onToggle} />);
    await fireEvent.press(screen.getByText('Chips'));
    expect(onToggle).toHaveBeenCalledWith('i1');
  });

  it('shows a full item as already taken and does not toggle it', async () => {
    const onToggle = jest.fn();
    await render(<BringPicker meetup={meetup} userId="u1" selected={[]} onToggle={onToggle} />);
    expect(screen.getByText('Already taken')).toBeTruthy();
    await fireEvent.press(screen.getByText('Cooler'));
    expect(onToggle).not.toHaveBeenCalled();
  });
});

describe('BringReview', () => {
  it("lists what someone's bringing", async () => {
    await render(<BringReview meetup={meetup} userId="u2" isSelf={false} />);
    expect(screen.getByText('Chips')).toBeTruthy();
    expect(screen.getByText('Cooler')).toBeTruthy();
  });

  it('says when they are bringing nothing', async () => {
    await render(<BringReview meetup={meetup} userId="u1" isSelf={false} />);
    expect(screen.getByText('Not bringing anything yet.')).toBeTruthy();
  });
});

describe('RidePicker', () => {
  it('tapping the selected role unselects it', async () => {
    const onRole = jest.fn();
    await render(<RidePicker role="driver" seats={2} onRole={onRole} onSeats={() => {}} />);
    await fireEvent.press(screen.getByText("I'm driving"));
    expect(onRole).toHaveBeenCalledWith(null);
  });

  it('a driver can add seats', async () => {
    const onSeats = jest.fn();
    await render(<RidePicker role="driver" seats={2} onRole={() => {}} onSeats={onSeats} />);
    await fireEvent.press(screen.getByLabelText('Increase'));
    expect(onSeats).toHaveBeenCalledWith(3);
  });
});

describe('RideReview', () => {
  it('shows a passenger without a car as needing a ride', async () => {
    await render(<RideReview meetup={meetup} userId="u2" viewerId="u1" />);
    expect(screen.getByText('Needs a ride')).toBeTruthy();
  });

  it('says when no ride is picked', async () => {
    await render(<RideReview meetup={meetup} userId="u1" viewerId="u2" />);
    expect(screen.getByText('No ride picked yet.')).toBeTruthy();
  });
});

describe('QuestionFields', () => {
  it('counts characters from 0/70', async () => {
    await render(<QuestionFields questions={[meetup.questions[0]]} values={{}} onChange={() => {}} />);
    expect(screen.getByText('0/70')).toBeTruthy();
  });

  it('cuts typed answers to 70 characters', async () => {
    const onChange = jest.fn();
    await render(<QuestionFields questions={[meetup.questions[0]]} values={{}} onChange={onChange} />);
    await fireEvent.changeText(screen.getByPlaceholderText('Your answer'), 'x'.repeat(90));
    expect(onChange).toHaveBeenCalledWith('q1', 'x'.repeat(70));
  });

  it('shows 70/70 at the limit', async () => {
    await render(<QuestionFields questions={[meetup.questions[0]]} values={{ q1: 'x'.repeat(70) }} onChange={() => {}} />);
    expect(screen.getByText('70/70')).toBeTruthy();
  });
});

describe('QuestionsReview', () => {
  it('shows each answer, or No answer', async () => {
    await render(<QuestionsReview meetup={meetup} userId="u2" />);
    expect(screen.getByText('Vegan')).toBeTruthy();
    expect(screen.getByText('No answer')).toBeTruthy();
  });
});
