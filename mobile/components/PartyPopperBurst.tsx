import React, { useEffect, useMemo } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const PARTICLE_COUNT = 50;
const DURATION_MS = 2200;

interface ParticleConfig {
  targetX: number; // final horizontal offset from origin (can be negative)
  peakRise: number; // how high above the origin the burst climbs
  fallDistance: number; // total downward travel during the fall phase
  swayAmplitude: number;
  swayFrequency: number;
  rotationSpeed: number;
  size: number;
  delayFraction: number; // fraction of total duration this particle waits before starting
}

const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);
const randomSigned = (max: number) => randomBetween(-max, max);

const buildParticles = (): ParticleConfig[] => {
  const { width, height } = Dimensions.get('window');
  return Array.from({ length: PARTICLE_COUNT }, () => ({
    targetX: randomSigned(width * 0.65),
    peakRise: randomBetween(height * 0.15, height * 0.6),
    fallDistance: randomBetween(height * 0.9, height * 1.5),
    swayAmplitude: randomBetween(15, 50),
    swayFrequency: randomBetween(2, 4),
    rotationSpeed: randomBetween(-720, 720),
    size: randomBetween(48, 90),
    delayFraction: randomBetween(0, 0.15),
  }));
};

const Particle = ({ progress, originX, originY, config, emoji }: {
  progress: SharedValue<number>;
  originX: number;
  originY: number;
  config: ParticleConfig;
  emoji: string;
}) => {
  const style = useAnimatedStyle(() => {
    const span = 1 - config.delayFraction;
    const t = span > 0
      ? Math.min(Math.max((progress.value - config.delayFraction) / span, 0), 1)
      : progress.value;

    const burstT = Math.min(t / 0.35, 1);
    const easedBurstT = 1 - Math.pow(1 - burstT, 3); // ease-out cubic
    const fallT = Math.min(Math.max((t - 0.2) / 0.8, 0), 1);

    const dx = config.targetX * easedBurstT
      + config.swayAmplitude * Math.sin(fallT * config.swayFrequency * Math.PI * 2);
    const dy = -config.peakRise * easedBurstT
      + config.fallDistance * fallT * fallT;

    const opacity = interpolate(t, [0, 0.05, 0.75, 1], [0, 1, 1, 0]);
    const scale = interpolate(t, [0, 0.08], [0, 1], 'clamp');
    const rotate = config.rotationSpeed * t;

    return {
      opacity,
      transform: [
        { translateX: dx },
        { translateY: dy },
        { scale },
        { rotate: `${rotate}deg` },
      ],
    };
  });

  return (
    <Animated.View
      style={[styles.particle, { left: originX, top: originY }, style]}
      renderToHardwareTextureAndroid
      shouldRasterizeIOS
    >
      <Animated.Text style={{ fontSize: config.size }}>{emoji}</Animated.Text>
    </Animated.View>
  );
};

interface PartyPopperBurstProps {
  emoji: string;
  originX?: number;
  originY?: number;
}

// Mount this fresh (e.g. via a `key` prop) each time you want a burst — the
// particle layout is randomized once on mount and the shared burst progress
// animates from 0 to 1 automatically.
const PartyPopperBurst = ({ emoji, originX, originY }: PartyPopperBurstProps) => {
  const progress = useSharedValue(0);
  const particles = useMemo(buildParticles, []);
  const { width, height } = Dimensions.get('window');
  const startX = originX ?? width / 2;
  const startY = originY ?? height / 2;

  useEffect(() => {
    progress.value = withTiming(1, { duration: DURATION_MS, easing: Easing.linear });
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.map((config, i) => (
        <Particle key={i} progress={progress} originX={startX} originY={startY} config={config} emoji={emoji} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  particle: {
    position: 'absolute',
  },
});

export default PartyPopperBurst;
