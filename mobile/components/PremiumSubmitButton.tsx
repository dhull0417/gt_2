import React, { useId, useState } from 'react';
import { Text, View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path, Rect, Text as SvgText } from 'react-native-svg';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { CROWN_PATH } from '@/components/ui/CrownIcon';
import { GoldShine } from '@/components/premium/GoldShine';
import { useRouter } from 'expo-router';

const EDGE = 2;
const ICON = 16;
const GAP = 6;
const FONT_SIZE = 16;

type Size = { width: number; height: number };
const sameSize = (a: Size, b: Size) => a.width === b.width && a.height === b.height;

/**
 * Takes the place of a form's Create/Save/Review button when the draft uses Premium features the
 * group doesn't have yet. The owner can open the paywall; anyone else is told the owner needs Premium.
 * Outline style: clear background, gold border, and the crown and words in Premium gold with the
 * shine sweeping across, matching the gold rows that need Premium (see PremiumHighlight).
 * Pass the form's own primary-button style so it sits in the footer like the button it replaces.
 */
export function PremiumSubmitButton({ mode, style }: { mode: 'upgrade' | 'ownerNeeds'; style?: StyleProp<ViewStyle> }) {
  const router = useRouter();
  const label = mode === 'upgrade' ? 'Premium' : 'Owner needs Premium';
  const radius = (StyleSheet.flatten(style)?.borderRadius as number | undefined) ?? 14;
  // Measured so the gold fits exactly; SVG ids are document-wide, so each button needs its own.
  const [btn, setBtn] = useState<Size>({ width: 0, height: 0 });
  const [content, setContent] = useState<Size>({ width: 0, height: 0 });
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const edgeId = `premiumBtnEdge-${id}`;
  const fillId = `premiumBtnFill-${id}`;
  const crownId = `premiumBtnCrown-${id}`;

  return (
    <PressableOpacity
      style={[style, styles.clear, mode === 'ownerNeeds' && styles.disabled]}
      onPress={mode === 'upgrade' ? () => router.push('/paywall') : undefined}
      disabled={mode === 'ownerNeeds'}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: mode === 'ownerNeeds' }}
      onLayout={e => {
        const { width, height } = e.nativeEvent.layout;
        setBtn(prev => (sameSize(prev, { width, height }) ? prev : { width, height }));
      }}
    >
      {btn.width > 0 && (
        <Svg testID="premium-btn-edge" style={StyleSheet.absoluteFill} width={btn.width} height={btn.height} pointerEvents="none">
          <GoldShine
            id={edgeId}
            width={btn.width}
            height={btn.height}
            tone="edge"
            shape={paint => (
              <Rect x={EDGE / 2} y={EDGE / 2} width={btn.width - EDGE} height={btn.height - EDGE} rx={radius} ry={radius}
                fill="none" stroke={paint} strokeWidth={EDGE} />
            )}
          />
        </Svg>
      )}
      {/* Lays out the crown and words; the SVG on top paints them so the gold can fill them. */}
      <View
        style={styles.content}
        onLayout={e => {
          const { width, height } = e.nativeEvent.layout;
          setContent(prev => (sameSize(prev, { width, height }) ? prev : { width, height }));
        }}
      >
        <View style={{ width: ICON, height: ICON, marginRight: GAP }} />
        <Text style={[styles.text, { color: 'transparent' }]}>{label}</Text>
        {content.width > 0 && (
          <Svg style={StyleSheet.absoluteFill} width={content.width} height={content.height} pointerEvents="none">
            <GoldShine
              id={fillId}
              width={content.width}
              height={content.height}
              tone="text"
              shape={paint => (
                <SvgText x={ICON + GAP} y={content.height / 2 + FONT_SIZE * 0.35} fontSize={FONT_SIZE} fontWeight="700" fill={paint}>
                  {label}
                </SvgText>
              )}
            />
          </Svg>
        )}
        {content.width > 0 && (
          <View pointerEvents="none" style={[styles.crown, { top: (content.height - ICON) / 2 }]}>
            <Svg width={ICON} height={ICON} viewBox="0 0 24 24">
              <GoldShine
                id={crownId}
                width={24}
                height={24}
                tone="text"
                shape={paint => <Path d={CROWN_PATH} fill="none" stroke={paint} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />}
              />
            </Svg>
          </View>
        )}
      </View>
    </PressableOpacity>
  );
}

const styles = StyleSheet.create({
  clear: { backgroundColor: 'transparent' },
  content: { flexDirection: 'row', alignItems: 'center' },
  crown: { position: 'absolute', left: 0, width: ICON, height: ICON },
  text: { fontSize: FONT_SIZE, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
