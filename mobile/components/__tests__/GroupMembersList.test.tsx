import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { GroupMembersList } from '../GroupMembersList';

jest.mock('@/contexts/AppearanceContext', () => ({
  useThemeColors: () => new Proxy({}, { get: () => '#123456' }),
}));

const u = (id: string, firstName: string) => ({ _id: id, firstName } as any);

const group = {
  _id: 'g1', isDM: false, owner: 'o', moderators: ['m2', { _id: 'm1' }],
  members: [u('r2', 'zoe'), u('m2', 'Yara'), u('r1', 'Adam'), u('o', 'Owen'), u('r3', 'bea'), u('m1', 'Ava')],
} as any;

const namesIn = (section: string) =>
  screen.getByTestId(section).findAll((n: any) => n.props.testID === 'member-name' && typeof n.type === 'string')
    .map((n: any) => n.props.children);

describe('GroupMembersList', () => {
  it('sorts each section A to Z', () => {
    render(<GroupMembersList groupDetails={group} currentUser={u('o', 'Owen')} isRemovingMember={false} onRemoveMember={() => {}} />);
    expect(namesIn('staff-section')).toEqual(['Ava', 'Owen', 'Yara']);
    expect(namesIn('members-section')).toEqual(['Adam', 'bea', 'zoe']);
  });

  it('shows section counts', () => {
    render(<GroupMembersList groupDetails={group} currentUser={u('o', 'Owen')} isRemovingMember={false} onRemoveMember={() => {}} />);
    expect(screen.getByText('Owner & Moderators — 3')).toBeTruthy();
    expect(screen.getByText('Members — 3')).toBeTruthy();
  });

  it('filters both sections by the search query and updates the counts', () => {
    render(<GroupMembersList groupDetails={group} currentUser={u('o', 'Owen')} isRemovingMember={false} onRemoveMember={() => {}} query="av" />);
    expect(namesIn('staff-section')).toEqual(['Ava']);
    expect(screen.getByText('Owner & Moderators — 1')).toBeTruthy();
    expect(screen.queryByTestId('members-section')).toBeNull();
  });

  it('says so when nobody matches', () => {
    render(<GroupMembersList groupDetails={group} currentUser={u('o', 'Owen')} isRemovingMember={false} onRemoveMember={() => {}} query="zz" />);
    expect(screen.getByText('No members match "zz"')).toBeTruthy();
    expect(screen.queryByTestId('staff-section')).toBeNull();
  });
});
