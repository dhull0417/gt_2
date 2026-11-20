import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { Collapsible } from '../Collapsible';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

describe('Collapsible', () => {
  it('shows content when open, removes it after closing, and brings it back', () => {
    const { rerender } = render(<Collapsible open><Text>inside</Text></Collapsible>);
    expect(screen.getByText('inside')).toBeTruthy();
    rerender(<Collapsible open={false}><Text>inside</Text></Collapsible>);
    expect(screen.queryByText('inside')).toBeNull();
    rerender(<Collapsible open><Text>inside</Text></Collapsible>);
    expect(screen.getByText('inside')).toBeTruthy();
  });
  it('starts closed with nothing rendered', () => {
    render(<Collapsible open={false}><Text>inside</Text></Collapsible>);
    expect(screen.queryByText('inside')).toBeNull();
  });
  it('appear: renders content that animates in', () => {
    render(<Collapsible open appear><Text>inside</Text></Collapsible>);
    expect(screen.getByText('inside')).toBeTruthy();
  });
});

describe('Collapsible layout', () => {
  it('keeps one animated style attached and never fixes the height once open', () => {
    render(<Collapsible open testID="c"><Text>inside</Text></Collapsible>);
    const flat = (s: any): any => (Array.isArray(s) ? Object.assign({}, ...s.map(flat)) : s || {});
    const style = flat(screen.getByTestId('c').props.style);
    expect(style.height).toBeUndefined();
    expect(style.maxHeight).toBeGreaterThanOrEqual(100000);
  });
});
