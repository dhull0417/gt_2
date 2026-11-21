import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import MeetupConfirmSheet from '../MeetupConfirmSheet';

const mockSetAssignments = jest.fn();
const mockSetAnswers = jest.fn();
jest.mock('@/utils/api', () => ({
  useApiClient: () => ({}),
  meetupApi: {
    setAssignments: (...a: any[]) => mockSetAssignments(...a),
    setAnswers: (...a: any[]) => mockSetAnswers(...a),
  },
}));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('@/contexts/AppearanceContext', () => ({ useThemeColors: () => new Proxy({}, { get: () => '#888888' }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/utils/haptics', () => ({ haptic: new Proxy({}, { get: () => () => {} }) }));

const q = (extra: object = {}) => ({ _id: 'q1', prompt: 'Diet?', type: 'text', options: [], required: false, ...extra });
const base: any = {
  _id: 'm1', name: 'Hike', group: { isPremium: true },
  members: [{ _id: 'u1', firstName: 'Ann' }, { _id: 'u2', firstName: 'Bo' }],
  in: ['u1', 'u2'], out: [], waitlist: [], guests: [],
  bringItems: [{ _id: 'i1', name: 'Chips' }], ridesEnabled: true,
  questions: [q()],
  bringClaims: [{ user: 'u2', item: 'i1' }], rides: [{ user: 'u2', role: 'passenger' }],
  answers: [{ user: 'u2', question: 'q1', value: 'Vegan' }],
};
const saved: any = { ...base, name: 'saved' };
const selectedTab = (t: string) => screen.getByTestId(`confirm-tab-${t}`).props.accessibilityState.selected;

beforeEach(() => {
  mockSetAssignments.mockReset().mockResolvedValue({ meetup: saved });
  mockSetAnswers.mockReset().mockResolvedValue({ meetup: saved });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('MeetupConfirmSheet (edit)', () => {
  it('lights the first tab and moves the light with Next', async () => {
    await render(<MeetupConfirmSheet visible meetup={base} currentUserId="u1" onClose={() => {}} />);
    expect(selectedTab('bring')).toBe(true);
    await fireEvent.press(screen.getByTestId('confirm-next'));
    expect(selectedTab('rides')).toBe(true);
    expect(selectedTab('bring')).toBe(false);
    await fireEvent.press(screen.getByTestId('confirm-next'));
    expect(selectedTab('questions')).toBe(true);
    expect(screen.queryByTestId('confirm-next')).toBeNull();
    expect(screen.getByTestId('confirm-submit')).toBeTruthy();
  });

  it('switches tabs when one is tapped', async () => {
    await render(<MeetupConfirmSheet visible meetup={base} currentUserId="u1" onClose={() => {}} />);
    await fireEvent.press(screen.getByTestId('confirm-tab-questions'));
    expect(selectedTab('questions')).toBe(true);
  });

  it('submits every tab together and closes', async () => {
    const onUpdated = jest.fn();
    const onClose = jest.fn();
    await render(<MeetupConfirmSheet visible meetup={base} currentUserId="u1" onClose={onClose} onUpdated={onUpdated} />);
    await fireEvent.press(screen.getByText('Chips'));
    await fireEvent.press(screen.getByTestId('confirm-tab-rides'));
    await fireEvent.press(screen.getByText("I'm driving"));
    await fireEvent.press(screen.getByTestId('confirm-tab-questions'));
    await fireEvent.changeText(screen.getByPlaceholderText('Your answer'), 'No nuts');
    await fireEvent.press(screen.getByTestId('confirm-submit'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockSetAssignments).toHaveBeenCalledWith({}, 'm1', { bring: ['i1'], ride: { role: 'driver', seats: 0 } });
    expect(mockSetAnswers).toHaveBeenCalledWith({}, 'm1', [{ question: 'q1', value: 'No nuts' }]);
    expect(onUpdated).toHaveBeenCalledWith(saved);
  });

  it('has no Next when there is only one tab', async () => {
    const onlyQuestions = { ...base, bringItems: [], ridesEnabled: false };
    await render(<MeetupConfirmSheet visible meetup={onlyQuestions} currentUserId="u1" onClose={() => {}} />);
    expect(screen.queryByTestId('confirm-next')).toBeNull();
    expect(screen.getByTestId('confirm-submit')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('confirm-submit'));
    await waitFor(() => expect(mockSetAnswers).toHaveBeenCalled());
    expect(mockSetAssignments).not.toHaveBeenCalled();
  });

  it('cuts a saved answer longer than 70 characters to 70 when it opens', async () => {
    const long = { ...base, answers: [{ user: 'u1', question: 'q1', value: 'y'.repeat(100) }] };
    await render(<MeetupConfirmSheet visible meetup={long} currentUserId="u1" onClose={() => {}} />);
    await fireEvent.press(screen.getByTestId('confirm-tab-questions'));
    expect(screen.getByText('70/70')).toBeTruthy();
  });

  it('goes back to Bring and refreshes when an item was just taken', async () => {
    mockSetAssignments.mockRejectedValue({ response: { data: { error: 'item_full', message: 'Someone just took that.' } } });
    const onStale = jest.fn();
    const onClose = jest.fn();
    await render(<MeetupConfirmSheet visible meetup={base} currentUserId="u1" onClose={onClose} onStale={onStale} />);
    await fireEvent.press(screen.getByTestId('confirm-tab-questions'));
    await fireEvent.press(screen.getByTestId('confirm-submit'));
    await waitFor(() => expect(onStale).toHaveBeenCalled());
    expect(selectedTab('bring')).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    expect(mockSetAnswers).not.toHaveBeenCalled();
  });

  it('keeps what saved and stays on Questions when the answers fail', async () => {
    mockSetAnswers.mockRejectedValue({ response: { data: { error: 'Answer must be 70 characters or less.' } } });
    const onUpdated = jest.fn();
    const onClose = jest.fn();
    await render(<MeetupConfirmSheet visible meetup={base} currentUserId="u1" onClose={onClose} onUpdated={onUpdated} />);
    await fireEvent.press(screen.getByTestId('confirm-tab-questions'));
    await fireEvent.press(screen.getByTestId('confirm-tab-bring'));
    await fireEvent.press(screen.getByTestId('confirm-tab-questions'));
    await fireEvent.press(screen.getByTestId('confirm-submit'));
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(saved));
    expect(selectedTab('questions')).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith('Could not save your answers', 'Answer must be 70 characters or less.');
  });

  it('holds Submit until required questions are answered', async () => {
    const required = { ...base, questions: [q({ required: true })] };
    await render(<MeetupConfirmSheet visible meetup={required} currentUserId="u1" onClose={() => {}} />);
    await fireEvent.press(screen.getByTestId('confirm-tab-questions'));
    expect(screen.getByText('Answer the questions marked * to submit.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('confirm-submit'));
    expect(mockSetAssignments).not.toHaveBeenCalled();
  });

  it('renders nothing when the meetup asks for nothing', async () => {
    const plain = { ...base, bringItems: [], ridesEnabled: false, questions: [] };
    await render(<MeetupConfirmSheet visible meetup={plain} currentUserId="u1" onClose={() => {}} />);
    expect(screen.queryByTestId('confirm-tab-bring')).toBeNull();
  });
});

describe('MeetupConfirmSheet (review)', () => {
  it("shows someone else's picks read-only with Done and More options", async () => {
    const onMore = jest.fn();
    await render(
      <MeetupConfirmSheet visible mode="review" meetup={base} currentUserId="u1"
        subject={{ id: 'u2', name: 'Bo' }} onClose={() => {}} onMoreOptions={onMore} />,
    );
    expect(screen.getByText('Bo')).toBeTruthy();
    expect(screen.getByText('Chips')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('confirm-next'));
    expect(screen.getByText('Needs a ride')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('confirm-next'));
    expect(screen.getByText('Vegan')).toBeTruthy();
    expect(screen.getByTestId('confirm-done')).toBeTruthy();
    expect(screen.queryByTestId('confirm-submit')).toBeNull();
    expect(screen.queryByPlaceholderText('Your answer')).toBeNull();
    await fireEvent.press(screen.getByText('More options'));
    expect(onMore).toHaveBeenCalled();
  });
});
