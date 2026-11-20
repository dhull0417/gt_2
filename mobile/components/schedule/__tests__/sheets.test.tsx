import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { CapacitySheet, BringItemsSheet, RsvpRulesSheet, OneOffWhenSheet, QuestionsSheet } from '../sheets';
import { blankQuestion } from '@/utils/questionDrafts';
import type { Issue } from '@/utils/formIssues';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('@/contexts/AppearanceContext', () => {
  const c = new Proxy({}, { get: (_t, k) => (k === 'danger' ? '#DC2626' : '#888888') });
  return { useThemeColors: () => c, useAppearance: () => ({ scheme: 'light' }) };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
jest.mock('@/components/UpgradeButton', () => ({ UpgradeButton: () => null }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const base = { visible: true, onClose: () => {} };

describe('CapacitySheet', () => {
  it('Set a limit shows the input, and its issue in red', () => {
    const onChange = jest.fn();
    const issue: Issue = { area: 'capacity', field: 'capacityInput', kind: 'missing', message: 'Enter how many people can come' };
    const { rerender } = render(<CapacitySheet {...base} issues={[]} mode="unlimited" input="" onChange={onChange} />);
    fireEvent.press(screen.getByTestId('capacity-limited'));
    expect(onChange).toHaveBeenCalledWith({ maxAttendeesMode: 'limited' });
    rerender(<CapacitySheet {...base} issues={[issue]} mode="limited" input="" onChange={onChange} />);
    expect(screen.getByText('Enter how many people can come')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Max attendees'), '12');
    expect(onChange).toHaveBeenLastCalledWith({ maxAttendeesInput: '12' });
  });
});

describe('BringItemsSheet', () => {
  const issue = { area: 'bring' as const, field: 'item:a', kind: 'missing' as const, message: 'Give every item a name, or remove the empty row.' };
  it('is titled Food/Things to bring', () => {
    render(<BringItemsSheet {...base} issues={[]} showIssues={false} items={[]} onChange={() => {}} />);
    expect(screen.getByText('Food/Things to bring')).toBeTruthy();
  });
  it('an empty item is not red while typing; Done reveals it and keeps the sheet open', () => {
    const onClose = jest.fn();
    render(<BringItemsSheet visible onClose={onClose} issues={[issue]} showIssues={false} items={[{ key: 'a', name: '', max: '' }]} onChange={() => {}} />);
    expect(screen.queryByText(issue.message)).toBeNull();
    fireEvent.press(screen.getByText('Done'));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(issue.message)).toBeTruthy();
  });
  it('Done closes when every item is fine', () => {
    const onClose = jest.fn();
    render(<BringItemsSheet visible onClose={onClose} issues={[]} showIssues={false} items={[{ key: 'a', name: 'Chips', max: '' }]} onChange={() => {}} />);
    fireEvent.press(screen.getByText('Done'));
    expect(onClose).toHaveBeenCalled();
  });
  it('after a Save attempt the problem shows straight away', () => {
    render(<BringItemsSheet {...base} issues={[issue]} showIssues items={[{ key: 'a', name: '', max: '' }]} onChange={() => {}} />);
    expect(screen.getByText(issue.message)).toBeTruthy();
  });
  it('adds an item', () => {
    const onChange = jest.fn();
    render(<BringItemsSheet {...base} issues={[]} showIssues={false} items={[]} onChange={onChange} />);
    fireEvent.press(screen.getByText('Add item to bring'));
    expect(onChange.mock.calls[0][0]).toHaveLength(1);
  });
});

describe('RsvpRulesSheet', () => {
  const value = { rsvpRestricted: false, leadEnabled: false, leadDays: 5, leadTime: '09:00 AM', deadlineEnabled: false, deadlineDays: 2, deadlineTime: '09:00 AM', minAttendeesInput: '', maxAttendeesMode: 'unlimited' as const, maxAttendeesInput: '' };
  it('Set a window limits RSVPs', () => {
    const onChange = jest.fn();
    render(<RsvpRulesSheet {...base} issues={[]} value={value} onChange={onChange} isPremium />);
    fireEvent.press(screen.getByTestId('rsvp-limit'));
    expect(onChange).toHaveBeenCalledWith({ rsvpRestricted: true });
  });
  it('shows the minimum issue', () => {
    render(<RsvpRulesSheet {...base} value={{ ...value, rsvpRestricted: true, deadlineEnabled: true, minAttendeesInput: '9' }} onChange={() => {}} isPremium
      issues={[{ area: 'rsvp', field: 'minAttendees', kind: 'invalid', message: "Can't be more than the max attendees." }]} />);
    expect(screen.getByText("Can't be more than the max attendees.")).toBeTruthy();
  });
});

describe('OneOffWhenSheet', () => {
  it('shows an end-time issue', () => {
    render(<OneOffWhenSheet {...base} asOverlay date="2026-12-05" time="05:00 PM" endTime="05:00 PM" minDate="2026-11-19" onChange={() => {}}
      issues={[{ area: 'when', field: 'endTime', kind: 'invalid', message: "End time can't be the same as the start time." }]} />);
    expect(screen.getAllByText("End time can't be the same as the start time.").length).toBeGreaterThan(0);
  });
});

describe('QuestionsSheet', () => {
  it('adds a question', () => {
    const onChange = jest.fn();
    render(<QuestionsSheet visible onClose={() => {}} showIssues={false} drafts={[]} onChange={onChange} savedLater="group" />);
    fireEvent.press(screen.getByText('Add question'));
    expect(onChange.mock.calls[0][0]).toHaveLength(1);
  });
  it('a blank question is only flagged when Done is tapped, and the sheet stays open', () => {
    const onClose = jest.fn();
    render(<QuestionsSheet visible onClose={onClose} showIssues={false} drafts={[blankQuestion()]} onChange={() => {}} savedLater="group" />);
    expect(screen.queryByText('Type the question, or remove it')).toBeNull();
    fireEvent.press(screen.getByText('Done'));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Type the question, or remove it')).toBeTruthy();
  });
  it('Done closes when every question is complete', () => {
    const onClose = jest.fn();
    render(<QuestionsSheet visible onClose={onClose} showIssues={false} drafts={[{ ...blankQuestion(), prompt: 'Diet?' }]} onChange={() => {}} savedLater="group" />);
    fireEvent.press(screen.getByText('Done'));
    expect(onClose).toHaveBeenCalled();
  });
});
