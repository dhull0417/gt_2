// Runs the patched spotlight library (patches/react-native-spotlight-tour+4.0.0.patch): with
// shape.path set, the cut-out is drawn from that path, sized to the highlighted item.
import React, { createRef } from 'react';
import { Text, View } from 'react-native';
import { render, act } from '@testing-library/react-native';
import { AttachStep, SpotlightTourProvider, type SpotlightTour } from 'react-native-spotlight-tour';

it('draws the highlight from the custom path, around the measured item plus padding', async () => {
  jest.useFakeTimers();
  const path = jest.fn((r: { x: number; y: number; width: number; height: number }) => `M ${r.x} ${r.y} Z`);
  const ref = createRef<SpotlightTour>();
  // The item reports itself at (20, 100), 170 x 170.
  jest.spyOn(View.prototype as any, 'measureInWindow').mockImplementation(function (cb: any) { cb(20, 100, 170, 170); });
  await render(
    <SpotlightTourProvider ref={ref} steps={[{ render: () => <Text>tip</Text> }]} motion="fade"
      shape={{ type: 'rectangle', padding: 6, path }}>
      <AttachStep index={0}><View><Text>tile</Text></View></AttachStep>
    </SpotlightTourProvider>,
  );
  await act(async () => { ref.current?.start(); });
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(path).toHaveBeenLastCalledWith({ x: 17, y: 97, width: 176, height: 176 });
  jest.useRealTimers();
});
