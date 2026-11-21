import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { Collapsible } from '../Collapsible';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

describe('Collapsible', () => {
  it('shows content when open, removes it after closing, and brings it back', async () => {
    const { rerender } = await render(<Collapsible open><Text>inside</Text></Collapsible>);
    expect(screen.getByText('inside')).toBeTruthy();
    await rerender(<Collapsible open={false}><Text>inside</Text></Collapsible>);
    expect(screen.queryByText('inside')).toBeNull();
    await rerender(<Collapsible open><Text>inside</Text></Collapsible>);
    expect(screen.getByText('inside')).toBeTruthy();
  });
  it('starts closed with nothing rendered', async () => {
    await render(<Collapsible open={false}><Text>inside</Text></Collapsible>);
    expect(screen.queryByText('inside')).toBeNull();
  });
  it('appear: renders content that animates in', async () => {
    await render(<Collapsible open appear><Text>inside</Text></Collapsible>);
    expect(screen.getByText('inside')).toBeTruthy();
  });
});

describe('Collapsible layout', () => {
  it('keeps one animated style attached and never fixes the height once open', async () => {
    await render(<Collapsible open testID="c"><Text>inside</Text></Collapsible>);
    const flat = (s: any): any => (Array.isArray(s) ? Object.assign({}, ...s.map(flat)) : s || {});
    const style = flat(screen.getByTestId('c').props.style);
    expect(style.height).toBeUndefined();
    expect(style.maxHeight).toBeGreaterThanOrEqual(100000);
  });
});
