import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { SwipeRowActions } from '../SwipeRowActions';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

const flat = (s: any): any => (Array.isArray(s) ? Object.assign({}, ...s.map(flat)) : s || {});

describe('SwipeRowActions', () => {
  it('is invisible while the row is closed, so a dimmed (pressed) card never shows it through', async () => {
    await render(<SwipeRowActions progress={{ value: 0 } as any} testID="a"><Text>Pin</Text></SwipeRowActions>);
    expect(flat(screen.getByTestId('a').props.style).opacity).toBe(0);
  });

  it('is visible as soon as the row starts opening', async () => {
    await render(<SwipeRowActions progress={{ value: 0.05 } as any} testID="a"><Text>Pin</Text></SwipeRowActions>);
    expect(flat(screen.getByTestId('a').props.style).opacity).toBe(1);
  });
});
