import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

// Repeat icon split into two color halves that spin together in a burst on tap
export const InOutSwapIcon = ({ burstNonce }: { burstNonce: number }) => {
    const burst = useSharedValue(0);
    const isFirstRender = useRef(true);

    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
        burst.value = withSequence(
            withTiming(1, { duration: 450, easing: Easing.out(Easing.cubic) }),
            withTiming(0, { duration: 0 })
        );
    }, [burstNonce]);

    const spinStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${burst.value * 360}deg` }],
    }));
    const greenStyle = spinStyle;
    const redStyle = spinStyle;

    return (
        <View style={{ width: 20, height: 20 }}>
            <View style={{ position: 'absolute', top: 0, left: 0, width: 20, height: 10, overflow: 'hidden' }}>
                <Animated.View style={[{ position: 'absolute', top: 0, left: 0 }, greenStyle]}>
                    <Feather name="repeat" size={20} color="#3FABA1" />
                </Animated.View>
            </View>
            <View style={{ position: 'absolute', top: 10, left: 0, width: 20, height: 10, overflow: 'hidden' }}>
                <Animated.View style={[{ position: 'absolute', top: -10, left: 0 }, redStyle]}>
                    <Feather name="repeat" size={20} color="#FF7A6E" />
                </Animated.View>
            </View>
        </View>
    );
};
