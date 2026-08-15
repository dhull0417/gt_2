import React, { useEffect } from 'react';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSequence,
    withTiming,
    runOnJS,
    Easing,
} from 'react-native-reanimated';

// Drives the In/Out RSVP buttons through breathe-up -> shake "In" -> shake "Out" -> breathe-down,
// on and on, while the user hasn't responded yet. Each phase is explicitly chained off the previous
// one's finish callback (rather than a single looping withRepeat/withSequence) so it always continues
// from wherever the value actually is instead of snapping back to a start value on each lap.
export const RsvpBreather = ({ active, children }: {
    active: boolean;
    children: (styles: { boxStyle: any; inTextStyle: any; outTextStyle: any }) => React.ReactNode;
}) => {
    const opacity = useSharedValue(0.6);
    const inShakeX = useSharedValue(0);
    const outShakeX = useSharedValue(0);
    const breathCount = useSharedValue(0);

    useEffect(() => {
        let cancelled = false;
        breathCount.value = 0;
        let runUp: () => void;
        let runInShake: () => void;
        let runOutShake: () => void;
        let runDown: () => void;

        const shakeThenCall = (onDone: () => void) => withSequence(
            withTiming(-6, { duration: 50 }),
            withTiming(6, { duration: 50 }),
            withTiming(-6, { duration: 50 }),
            withTiming(6, { duration: 50 }),
            withTiming(-3, { duration: 50 }),
            withTiming(0, { duration: 50 }, (finished) => { if (finished) runOnJS(onDone)(); })
        );

        runUp = () => {
            if (cancelled) return;
            opacity.value = withTiming(1, { duration: 1900, easing: Easing.inOut(Easing.sin) }, (finished) => {
                if (!finished) return;
                breathCount.value += 1;
                runOnJS(breathCount.value % 3 === 1 ? runInShake : runDown)();
            });
        };
        runInShake = () => {
            if (cancelled) return;
            inShakeX.value = shakeThenCall(runOutShake);
        };
        runOutShake = () => {
            if (cancelled) return;
            outShakeX.value = shakeThenCall(runDown);
        };
        runDown = () => {
            if (cancelled) return;
            opacity.value = withTiming(0.6, { duration: 1900, easing: Easing.inOut(Easing.sin) }, (finished) => {
                if (finished) runOnJS(runUp)();
            });
        };

        if (active) {
            runUp();
        } else {
            opacity.value = withTiming(1, { duration: 200 });
            inShakeX.value = withTiming(0, { duration: 150 });
            outShakeX.value = withTiming(0, { duration: 150 });
        }

        return () => { cancelled = true; };
    }, [active]);

    const boxStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
    const inTextStyle = useAnimatedStyle(() => ({ transform: [{ translateX: inShakeX.value }] }));
    const outTextStyle = useAnimatedStyle(() => ({ transform: [{ translateX: outShakeX.value }] }));

    return <>{children({ boxStyle, inTextStyle, outTextStyle })}</>;
};

export default RsvpBreather;
