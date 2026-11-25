import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View, type LayoutRectangle, type StyleProp, type ViewInstance, type ViewStyle } from 'react-native';
import { AttachStep, SpotlightTourProvider, type RenderProps, type SpotlightTour, type TourStep } from 'react-native-spotlight-tour';
import { TourTip } from '@/components/tour/TourTip';
import { TourGlow } from '@/components/tour/TourGlow';
import { WelcomeCard } from '@/components/tour/WelcomeCard';
import { brandTourTint } from '@/components/tour/brandTint';
import type { SquircleTint } from '@/components/ui/SquircleTile';
import { useAppearance, useThemeColors } from '@/contexts/AppearanceContext';
import { useScreenTour } from '@/hooks/useScreenTour';
import { useTourGate } from '@/contexts/TourGateContext';
import type { User } from '@/utils/api';
import type { EmptyTourStep } from '@/utils/emptyScreenTours';
import { squirclePath } from '@/utils/squirclePath';
import { waitUntilStill } from '@/utils/waitUntilStill';

// A first-visit tour over a whole screen. Wrap the screen in <ScreenTour> and each element to
// highlight in <TourTarget target="…">, matching the steps' targets. Highlights match each element's
// shape (its corner radius, or a circle), with the brand colour. Used by the empty Meetups and
// Groups tabs; Group Details has its own tile-coloured setup.

const SPOT_PADDING = 8;

type Ctx = {
  steps: EmptyTourStep[];
  /** 1 when a welcome card comes first (tour step 0), so targets' tour indexes shift by one. */
  offset: number;
  active: string | null;
  tint: SquircleTint;
  register: (target: string, node: ViewInstance | null) => void;
};
const TourCtx = createContext<Ctx | null>(null);

type Props = {
  tourKey: string;
  steps: EmptyTourStep[];
  enabled: boolean;
  user: Pick<User, 'seenTours'> | undefined;
  /** Tests only; defaults to TOURS_ALWAYS_SHOW. */
  alwaysShow?: boolean;
  /** A centred welcome card before the first highlight (the first-run Meetups tour). */
  welcome?: { body: string; cta: string };
  children: React.ReactNode;
};

export function ScreenTour({ tourKey, steps, enabled, user, alwaysShow, welcome, children }: Props) {
  const colors = useThemeColors();
  const { scheme } = useAppearance();
  const tint = useMemo(() => brandTourTint(colors, scheme === 'dark'), [colors, scheme]);
  const tourRef = useRef<SpotlightTour>(null);
  const nodes = useRef<Record<string, ViewInstance | null>>({});
  const [active, setActive] = useState<string | null>(null);

  const { reportTour } = useTourGate();
  const start = useCallback(() => {
    tourRef.current?.start();
    reportTour(tourKey, 'started');
  }, [reportTour, tourKey]);
  useScreenTour({ key: tourKey, user, enabled, start, alwaysShow });
  const register = useCallback((target: string, node: ViewInstance | null) => { nodes.current[target] = node; }, []);

  const offset = welcome ? 1 : 0;
  const tourSteps = useMemo<TourStep[]>(() => [
    ...(welcome ? [{
      // Nothing is highlighted: the step is anchored to a 1pt point (see below) and draws no cut-out.
      shape: { type: 'rectangle' as const, padding: 0, path: () => '' },
      arrow: false,
      offset: 0,
      before: () => setActive(null),
      render: (props: RenderProps) => <WelcomeCard {...props} body={welcome.body} cta={welcome.cta} />,
    }] : []),
    ...steps.map((step): TourStep => {
    // Grow the corner radius with the padding so the outline runs parallel to the element's.
    const radius = step.circle ? 9999 : step.radius + SPOT_PADDING / 2;
    const continuous = Platform.OS === 'ios' && !step.circle;
    return {
      shape: { type: 'rectangle', padding: SPOT_PADDING, path: (r: LayoutRectangle) => squirclePath(r, radius, continuous) },
      before: async () => {
        // These screens fade their content in; measure only once the element has stopped moving.
        const node = nodes.current[step.target];
        if (node) await waitUntilStill((cb) => node.measureInWindow((_x: number, y: number) => cb(y)), { minMs: 0, maxMs: 800 });
        setActive(step.target);
      },
      render: (props) => (
        <TourTip {...props} current={props.current - offset} title={step.title} body={step.body} total={steps.length} icon={step.icon} tint={tint} />
      ),
    };
    }),
  ], [steps, tint, welcome, offset]);

  const ctx = useMemo<Ctx>(() => ({ steps, offset, active, tint, register }), [steps, offset, active, tint, register]);

  return (
    <SpotlightTourProvider
      ref={tourRef}
      steps={tourSteps}
      onStop={() => { setActive(null); reportTour(tourKey, 'ended'); }}
      motion="fade"
      overlayOpacity={0.72}
      arrow={{ color: colors.surface }}
    >
      <TourCtx.Provider value={ctx}>
        {children}
        {welcome && (
          // Where the welcome card hangs from: a point a third of the way down, centred.
          <AttachStep index={0} style={styles.welcomeAnchor}>
            <View pointerEvents="none" style={{ width: 1, height: 1 }} />
          </AttachStep>
        )}
      </TourCtx.Provider>
    </SpotlightTourProvider>
  );
}

type TargetProps = {
  target: string;
  children: React.ReactElement;
  /** Passed to the wrapper. Use alignSelf to keep the element where its parent placed it. */
  style?: StyleProp<ViewStyle>;
  /** Stretch the wrapper across its parent (full-width rows). */
  fill?: boolean;
};

// Marks an element as a tour step. Outside a <ScreenTour>, or for a target that isn't a step, it
// renders the element untouched.
export function TourTarget({ target, children, style, fill }: TargetProps) {
  const ctx = useContext(TourCtx);
  const index = ctx ? ctx.steps.findIndex((s) => s.target === target) : -1;
  if (!ctx || index < 0) return children;
  const step = ctx.steps[index];
  return (
    <AttachStep index={index + ctx.offset} fill={fill} style={style}>
      <View ref={(el) => ctx.register(target, el)}>
        {children}
        <TourGlow active={ctx.active === target} color={ctx.tint.fg} borderRadius={step.circle ? 9999 : step.radius} />
      </View>
    </AttachStep>
  );
}

const styles = StyleSheet.create({
  welcomeAnchor: { position: 'absolute', top: '28%', left: '50%' },
});
