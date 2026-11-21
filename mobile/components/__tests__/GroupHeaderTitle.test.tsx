import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { GroupHeaderTitle, GROUP_HEADER_TITLE_HEIGHT } from '../GroupHeaderTitle';

jest.mock('@/contexts/AppearanceContext', () => ({
  useThemeColors: () => ({ textFaint: '#999', textSecondary: '#333', backgroundAlt: '#eee' }),
}));

// The chat header and the group details header draw the same title (logo + name + subtitle) in the
// same spot. If the two rows differ in height, the logo jumps up or down when one screen slides over
// the other. So every variant must render at one fixed height.
const variants = {
  'chat, group': { subtitle: '5 members · Tap for info', showChevron: true },
  'chat, DM': { subtitle: 'Tap for info', showChevron: true },
  'details, group': { subtitle: '5 members' },
  'details, no subtitle yet': {},
} as const;

describe('GroupHeaderTitle', () => {
  it.each(Object.entries(variants))('is the same fixed height: %s', async (_label, props) => {
    await render(<GroupHeaderTitle name="Hiking Crew" imageUrl={null} {...props} />);
    const style = StyleSheet.flatten(screen.getByTestId('group-header-title').props.style);
    expect(style.height).toBe(GROUP_HEADER_TITLE_HEIGHT);
  });

  it('is tall enough for the name and the subtitle', () => {
    // text-lg name line (28) + subtitle line (16) + gap
    expect(GROUP_HEADER_TITLE_HEIGHT).toBeGreaterThanOrEqual(44);
  });

  it('shows the name and subtitle', async () => {
    await render(<GroupHeaderTitle name="Hiking Crew" subtitle="5 members" />);
    expect(screen.getByText('Hiking Crew')).toBeTruthy();
    expect(screen.getByText('5 members')).toBeTruthy();
  });
});
