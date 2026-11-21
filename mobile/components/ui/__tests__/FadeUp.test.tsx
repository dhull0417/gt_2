import React from 'react';
import { Text } from 'react-native';
import { act, render, screen, fireEvent } from '@testing-library/react-native';
import { Pressable } from 'react-native';
import { withDelay, withTiming, useReducedMotion } from 'react-native-reanimated';
import { fadeUpDelay, FADE_UP, FadeUp, FadeUpContext, FadeUpScreen, useFadeUpReplay, markAppRevealed, resetAppRevealedForTests } from '../FadeUp';

let focusCallback: (() => void | (() => void)) | undefined;
let blurCleanup: (() => void) | undefined;
jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void) => { focusCallback = cb; },
}));
const focus = () => act(async () => {
  const cleanup = focusCallback?.();
  blurCleanup = typeof cleanup === 'function' ? cleanup : undefined;
});
const blur = () => act(async () => { blurCleanup?.(); blurCleanup = undefined; });

jest.mock('react-native-reanimated', () => {
  const mock = require('react-native-reanimated/mock');
  const { useRef } = require('react');
  return {
    ...mock,
    // The stock mock makes a new shared value every render; keep one per component like the real hook.
    useSharedValue: (init: number) => useRef({ value: init }).current,
    withTiming: jest.fn((toValue: number) => toValue),
    withDelay: jest.fn((_ms: number, anim: unknown) => anim),
    useReducedMotion: jest.fn(() => false),
  };
});

const timingCalls = () => (withTiming as jest.Mock).mock.calls.length;
const flat = (s: any): any => (Array.isArray(s) ? Object.assign({}, ...s.map(flat)) : s || {});

beforeEach(() => {
  resetAppRevealedForTests();
  markAppRevealed(); // splash already gone, unless a test says otherwise
  (withTiming as jest.Mock).mockClear();
  (useReducedMotion as jest.Mock).mockReturnValue(false);
});

describe('fadeUpDelay', () => {
  it('staggers by 50ms per index and caps at 400ms', async () => {
    expect(fadeUpDelay(undefined)).toBe(0);
    expect(fadeUpDelay(0)).toBe(0);
    expect(fadeUpDelay(3)).toBe(150);
    expect(fadeUpDelay(8)).toBe(400);
    expect(fadeUpDelay(20)).toBe(400);
    expect(fadeUpDelay(-1)).toBe(0);
  });
  it('uses the spec values', async () => {
    expect(FADE_UP).toEqual({ offset: 12, duration: 320, stagger: 50, maxIndex: 8 });
  });
});

describe('FadeUp', () => {
  it('renders children without a FadeUpScreen and animates on mount', async () => {
    await render(<FadeUp><Text>card</Text></FadeUp>);
    expect(screen.getByText('card')).toBeTruthy();
    expect(timingCalls()).toBeGreaterThan(0);
  });

  it('starts hidden and 12px low', async () => {
    await render(<FadeUp testID="f"><Text>card</Text></FadeUp>);
    const style = flat(screen.getByTestId('f').props.style);
    expect(style.opacity).toBe(0);
    expect(flat(style.transform)).toEqual({ translateY: 12 });
  });

  it('renders at rest with no animation when Reduce Motion is on', async () => {
    (useReducedMotion as jest.Mock).mockReturnValue(true);
    await render(<FadeUp testID="f"><Text>card</Text></FadeUp>);
    const style = flat(screen.getByTestId('f').props.style);
    expect(style.opacity).toBe(1);
    expect(flat(style.transform)).toEqual({ translateY: 0 });
    expect(timingCalls()).toBe(0);
  });

  it('does not replay when it re-renders with new props', async () => {
    const { rerender } = await render(<FadeUp index={1}><Text>Out</Text></FadeUp>);
    const after = timingCalls();
    await rerender(<FadeUp index={1}><Text>In</Text></FadeUp>);
    expect(screen.getByText('In')).toBeTruthy();
    expect(timingCalls()).toBe(after);
  });

  it('replays when the screen replay token changes', async () => {
    const { rerender } = await render(
      <FadeUpContext.Provider value={{ token: 0, replay: () => {} }}><FadeUp><Text>card</Text></FadeUp></FadeUpContext.Provider>,
    );
    const after = timingCalls();
    await rerender(
      <FadeUpContext.Provider value={{ token: 1, replay: () => {} }}><FadeUp><Text>card</Text></FadeUp></FadeUpContext.Provider>,
    );
    expect(timingCalls()).toBeGreaterThan(after);
  });
});

describe('FadeUpScreen', () => {
  it('animates on the first focus of a screen that was built before it was shown (preloaded tab)', async () => {
    await render(<FadeUpScreen><FadeUp><Text>card</Text></FadeUp></FadeUpScreen>);
    expect(timingCalls()).toBe(0); // built off-screen: nothing plays unseen
    await focus();
    expect(timingCalls()).toBeGreaterThan(0);
  });

  it('waits for the splash screen to go before the first fade-up', async () => {
    resetAppRevealedForTests();
    const Screen = ({ label }: { label: string }) => (
      <FadeUpScreen><FadeUp testID="f"><Text>{label}</Text></FadeUp></FadeUpScreen>
    );
    const { rerender } = await render(<Screen label="a" />);
    await focus(); // focused, but still behind the splash
    await rerender(<Screen label="b" />);
    expect(timingCalls()).toBe(0);
    expect(flat(screen.getByTestId('f').props.style).opacity).toBe(0);
    await act(async () => { markAppRevealed(); });
    expect(timingCalls()).toBeGreaterThan(0);
  });

  it('replays every later focus', async () => {
    await render(<FadeUpScreen><FadeUp><Text>card</Text></FadeUp></FadeUpScreen>);
    await focus();
    await blur();
    const after = timingCalls();
    await focus();
    expect(timingCalls()).toBeGreaterThan(after);
    await blur();
    const again = timingCalls();
    await focus();
    expect(timingCalls()).toBeGreaterThan(again);
  });

  it('useFadeUpReplay replays on demand', async () => {
    const Replayer = () => {
      const replay = useFadeUpReplay();
      return <Pressable testID="replay" onPress={replay} />;
    };
    await render(<FadeUpScreen><Replayer /><FadeUp><Text>card</Text></FadeUp></FadeUpScreen>);
    const after = timingCalls();
    await fireEvent.press(screen.getByTestId('replay'));
    expect(timingCalls()).toBeGreaterThan(after);
  });
});

describe('scrolled-in rows', () => {
  afterEach(() => jest.restoreAllMocks());

  it('cascade rows get their delay; rows mounting later (scroll) start immediately', async () => {
    let now = 1000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const Screen = ({ late }: { late: boolean }) => (
      <FadeUpScreen>
        <FadeUp index={3}><Text>early</Text></FadeUp>
        {late && <FadeUp index={20}><Text>late</Text></FadeUp>}
      </FadeUpScreen>
    );
    const { rerender } = await render(<Screen late={false} />);
    await focus();
    expect((withDelay as jest.Mock).mock.calls.at(-1)[0]).toBe(150);
    now = 3000; // user scrolls two seconds later
    await rerender(<Screen late />);
    expect((withDelay as jest.Mock).mock.calls.at(-1)[0]).toBe(0);
  });

  it('a replay restarts the cascade clock', async () => {
    let now = 1000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    await render(<FadeUpScreen><FadeUp index={4}><Text>card</Text></FadeUp></FadeUpScreen>);
    await focus();
    await blur();
    now = 9000;
    await focus();
    expect((withDelay as jest.Mock).mock.calls.at(-1)[0]).toBe(200);
  });
});

describe('leaving the screen', () => {
  const Screen = ({ label }: { label: string }) => (
    <FadeUpScreen><FadeUp testID="f"><Text>{label}</Text></FadeUp></FadeUpScreen>
  );

  it('hides content on blur so coming back never shows a stale visible frame', async () => {
    const { rerender } = await render(<Screen label="a" />);
    await focus();
    await rerender(<Screen label="a2" />);
    expect(flat(screen.getByTestId('f').props.style).opacity).toBe(1); // animated in
    await blur();
    await rerender(<Screen label="b" />); // re-read the style while away
    expect(flat(screen.getByTestId('f').props.style).opacity).toBe(0);
  });

  it('fades back in on return', async () => {
    const { rerender } = await render(<Screen label="a" />);
    await focus();
    await blur();
    const before = timingCalls();
    await focus();
    await rerender(<Screen label="b" />);
    expect(timingCalls()).toBeGreaterThan(before);
    expect(flat(screen.getByTestId('f').props.style).opacity).toBe(1);
  });

  it('stays visible on blur when Reduce Motion is on', async () => {
    (useReducedMotion as jest.Mock).mockReturnValue(true);
    const { rerender } = await render(<Screen label="a" />);
    await focus();
    await blur();
    await rerender(<Screen label="b" />);
    expect(flat(screen.getByTestId('f').props.style).opacity).toBe(1);
  });
});
