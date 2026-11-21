import React from 'react';
import { Text } from 'react-native';
import { act, render, screen, fireEvent } from '@testing-library/react-native';
import { Pressable } from 'react-native';
import { withDelay, withTiming, useReducedMotion } from 'react-native-reanimated';
import { fadeUpDelay, FADE_UP, FadeUp, FadeUpContext, FadeUpScreen, useFadeUpReplay } from '../FadeUp';

let focusCallback: (() => void) | undefined;
jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void) => { focusCallback = cb; },
}));
const focus = () => act(() => { focusCallback?.(); });

jest.mock('react-native-reanimated', () => {
  const mock = require('react-native-reanimated/mock');
  return {
    ...mock,
    withTiming: jest.fn((toValue: number) => toValue),
    withDelay: jest.fn((_ms: number, anim: unknown) => anim),
    useReducedMotion: jest.fn(() => false),
  };
});

const timingCalls = () => (withTiming as jest.Mock).mock.calls.length;
const flat = (s: any): any => (Array.isArray(s) ? Object.assign({}, ...s.map(flat)) : s || {});

beforeEach(() => {
  (withTiming as jest.Mock).mockClear();
  (useReducedMotion as jest.Mock).mockReturnValue(false);
});

describe('fadeUpDelay', () => {
  it('staggers by 50ms per index and caps at 400ms', () => {
    expect(fadeUpDelay(undefined)).toBe(0);
    expect(fadeUpDelay(0)).toBe(0);
    expect(fadeUpDelay(3)).toBe(150);
    expect(fadeUpDelay(8)).toBe(400);
    expect(fadeUpDelay(20)).toBe(400);
    expect(fadeUpDelay(-1)).toBe(0);
  });
  it('uses the spec values', () => {
    expect(FADE_UP).toEqual({ offset: 12, duration: 320, stagger: 50, maxIndex: 8 });
  });
});

describe('FadeUp', () => {
  it('renders children without a FadeUpScreen and animates on mount', () => {
    render(<FadeUp><Text>card</Text></FadeUp>);
    expect(screen.getByText('card')).toBeTruthy();
    expect(timingCalls()).toBeGreaterThan(0);
  });

  it('starts hidden and 12px low', () => {
    render(<FadeUp testID="f"><Text>card</Text></FadeUp>);
    const style = flat(screen.getByTestId('f').props.style);
    expect(style.opacity).toBe(0);
    expect(flat(style.transform)).toEqual({ translateY: 12 });
  });

  it('renders at rest with no animation when Reduce Motion is on', () => {
    (useReducedMotion as jest.Mock).mockReturnValue(true);
    render(<FadeUp testID="f"><Text>card</Text></FadeUp>);
    const style = flat(screen.getByTestId('f').props.style);
    expect(style.opacity).toBe(1);
    expect(flat(style.transform)).toEqual({ translateY: 0 });
    expect(timingCalls()).toBe(0);
  });

  it('does not replay when it re-renders with new props', () => {
    const { rerender } = render(<FadeUp index={1}><Text>Out</Text></FadeUp>);
    const after = timingCalls();
    rerender(<FadeUp index={1}><Text>In</Text></FadeUp>);
    expect(screen.getByText('In')).toBeTruthy();
    expect(timingCalls()).toBe(after);
  });

  it('replays when the screen replay token changes', () => {
    const { rerender } = render(
      <FadeUpContext.Provider value={{ token: 0, replay: () => {} }}><FadeUp><Text>card</Text></FadeUp></FadeUpContext.Provider>,
    );
    const after = timingCalls();
    rerender(
      <FadeUpContext.Provider value={{ token: 1, replay: () => {} }}><FadeUp><Text>card</Text></FadeUp></FadeUpContext.Provider>,
    );
    expect(timingCalls()).toBeGreaterThan(after);
  });
});

describe('FadeUpScreen', () => {
  it('does not replay on the first focus (mount already animated)', () => {
    render(<FadeUpScreen><FadeUp><Text>card</Text></FadeUp></FadeUpScreen>);
    const after = timingCalls();
    focus();
    expect(timingCalls()).toBe(after);
  });

  it('replays every later focus', () => {
    render(<FadeUpScreen><FadeUp><Text>card</Text></FadeUp></FadeUpScreen>);
    focus();
    const after = timingCalls();
    focus();
    expect(timingCalls()).toBeGreaterThan(after);
    const again = timingCalls();
    focus();
    expect(timingCalls()).toBeGreaterThan(again);
  });

  it('useFadeUpReplay replays on demand', () => {
    const Replayer = () => {
      const replay = useFadeUpReplay();
      return <Pressable testID="replay" onPress={replay} />;
    };
    render(<FadeUpScreen><Replayer /><FadeUp><Text>card</Text></FadeUp></FadeUpScreen>);
    const after = timingCalls();
    fireEvent.press(screen.getByTestId('replay'));
    expect(timingCalls()).toBeGreaterThan(after);
  });
});

describe('scrolled-in rows', () => {
  afterEach(() => jest.restoreAllMocks());

  it('cascade rows get their delay; rows mounting later (scroll) start immediately', () => {
    let now = 1000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const Screen = ({ late }: { late: boolean }) => (
      <FadeUpScreen>
        <FadeUp index={3}><Text>early</Text></FadeUp>
        {late && <FadeUp index={20}><Text>late</Text></FadeUp>}
      </FadeUpScreen>
    );
    const { rerender } = render(<Screen late={false} />);
    expect((withDelay as jest.Mock).mock.calls.at(-1)[0]).toBe(150);
    now = 3000; // user scrolls two seconds later
    rerender(<Screen late />);
    expect((withDelay as jest.Mock).mock.calls.at(-1)[0]).toBe(0);
  });

  it('a replay restarts the cascade clock', () => {
    let now = 1000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    render(<FadeUpScreen><FadeUp index={4}><Text>card</Text></FadeUp></FadeUpScreen>);
    focus();
    now = 9000;
    focus();
    expect((withDelay as jest.Mock).mock.calls.at(-1)[0]).toBe(200);
  });
});
