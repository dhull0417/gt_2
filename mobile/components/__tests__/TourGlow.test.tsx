import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { TourGlow } from '../tour/TourGlow';

describe('TourGlow', () => {
  it('marks itself active only on the highlighted tile', async () => {
    await render(<><TourGlow active color="#7C3AED" borderRadius={28} /><TourGlow active={false} color="#16A34A" borderRadius={28} /></>);
    expect(screen.getAllByTestId('tour-glow-active')).toHaveLength(1);
  });
  it('never blocks taps on the tile under it', async () => {
    await render(<TourGlow active color="#7C3AED" borderRadius={28} />);
    expect(screen.getByTestId('tour-glow-active').props.pointerEvents).toBe('none');
  });
});
