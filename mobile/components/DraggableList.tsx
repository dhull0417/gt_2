import React, { useEffect, useState } from 'react';
import { View, LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  scrollTo,
  useAnimatedRef,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useScrollViewOffset,
  useSharedValue,
  withTiming,
  SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

/**
 * A vertically scrolling screen whose main content is a list of fixed-height rows
 * that can be reordered: press and hold a row, then drag it up or down. The list
 * auto-scrolls near the top/bottom edges, and other rows slide out of the way.
 *
 * Rows live in "slots" at fixed y positions (`slotTops`), so non-draggable
 * decorations (e.g. section dividers) can sit between slots; dragging a row moves
 * it between slots rather than moving the dividers.
 */

const EDGE = 90;        // px from the viewport edge where auto-scroll kicks in
const SCROLL_STEP = 14; // px per frame

export interface DraggableItem { id: string }

interface Props<T extends DraggableItem> {
  data: T[];
  rowHeight: number;
  /** Top of each slot, in the list container's coordinates (data.length entries). */
  slotTops: number[];
  /** Total height of the list container (rows + decorations). */
  contentHeight: number;
  renderRow: (item: T, index: number) => React.ReactNode;
  /** Absolutely positioned, non-draggable content (dividers, headers). */
  decorations?: { key: string; top: number; height: number; node: React.ReactNode }[];
  /** Called as the order changes while dragging. */
  onReorder: (ids: string[]) => void;
  /** Rendered above the list, inside the same scroll view. */
  header?: React.ReactNode;
  footer?: React.ReactNode;
  contentContainerStyle?: object;
  keyboardShouldPersistTaps?: 'always' | 'never' | 'handled';
}

function Row<T extends DraggableItem>({
  item, index, rowHeight, order, slotTopsSV, activeId, dragTop, startTop, startScroll, touchY, transY,
  scrollY, onDragStart, onDragEnd, children,
}: {
  item: T; index: number; rowHeight: number;
  order: SharedValue<string[]>; slotTopsSV: SharedValue<number[]>; activeId: SharedValue<string | null>;
  dragTop: SharedValue<number>; startTop: SharedValue<number>; startScroll: SharedValue<number>;
  touchY: SharedValue<number>; transY: SharedValue<number>; scrollY: SharedValue<number>;
  onDragStart: () => void; onDragEnd: () => void; children: React.ReactNode;
}) {
  const id = item.id;

  const pan = Gesture.Pan()
    .activateAfterLongPress(250)
    .onStart((e) => {
      const slot = order.value.indexOf(id);
      activeId.value = id;
      startTop.value = slotTopsSV.value[slot] ?? 0;
      startScroll.value = scrollY.value;
      touchY.value = e.y;
      transY.value = 0;
      runOnJS(onDragStart)();
    })
    .onUpdate((e) => {
      transY.value = e.translationY;
    })
    .onFinalize(() => {
      if (activeId.value === id) {
        activeId.value = null;
        runOnJS(onDragEnd)();
      }
    });

  const style = useAnimatedStyle(() => {
    if (activeId.value === id) {
      return {
        top: dragTop.value,
        zIndex: 10,
        transform: [{ scale: 1.03 }],
        shadowOpacity: 0.2,
        elevation: 8,
      };
    }
    const slot = order.value.indexOf(id);
    const target = slotTopsSV.value[slot] ?? 0;
    return {
      top: withTiming(target, { duration: 160 }),
      zIndex: 0,
      transform: [{ scale: withTiming(1, { duration: 120 }) }],
      shadowOpacity: 0,
      elevation: 0,
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[
          { position: 'absolute', left: 0, right: 0, height: rowHeight, shadowColor: '#000', shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
          style,
        ]}
        // the row's own index is only used by callers for numbering
        accessibilityLabel={`Position ${index + 1}`}
      >
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

export default function DraggableList<T extends DraggableItem>({
  data, rowHeight, slotTops, contentHeight, renderRow, decorations, onReorder,
  header, footer, contentContainerStyle, keyboardShouldPersistTaps = 'handled',
}: Props<T>) {
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollY = useScrollViewOffset(scrollRef);

  const [dragging, setDragging] = useState(false);

  const ids = data.map((d) => d.id);
  const idsKey = ids.join('|');
  const order = useSharedValue<string[]>(ids);
  const slotTopsSV = useSharedValue<number[]>(slotTops);
  const activeId = useSharedValue<string | null>(null);
  const startTop = useSharedValue(0);
  const startScroll = useSharedValue(0);
  const touchY = useSharedValue(0);
  const transY = useSharedValue(0);
  const containerY = useSharedValue(0);
  const viewportH = useSharedValue(0);
  const contentH = useSharedValue(0);

  // Keep the shared copies in step with props (parent is the source of truth).
  useEffect(() => { order.value = idsKey ? idsKey.split('|') : []; }, [idsKey, order]);
  const slotTopsKey = slotTops.join(',');
  useEffect(() => { slotTopsSV.value = slotTops; }, [slotTopsKey, slotTopsSV, slotTops]);

  const dragTop = useDerivedValue(() => startTop.value + transY.value + (scrollY.value - startScroll.value));

  const emit = (next: string[]) => onReorder(next);
  const tick = () => { Haptics.selectionAsync().catch(() => {}); };
  const onDragStart = () => {
    setDragging(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };
  const onDragEnd = () => setDragging(false);

  useFrameCallback(() => {
    'worklet';
    const id = activeId.value;
    if (!id) return;

    // Which slot is the dragged row closest to?
    const tops = slotTopsSV.value;
    const center = dragTop.value + rowHeight / 2;
    let best = 0;
    let bestDist = Infinity;
    for (let s = 0; s < tops.length; s++) {
      const d = Math.abs(tops[s] + rowHeight / 2 - center);
      if (d < bestDist) { bestDist = d; best = s; }
    }
    const cur = order.value.indexOf(id);
    if (best !== cur && cur >= 0) {
      const next = order.value.slice();
      next.splice(cur, 1);
      next.splice(best, 0, id);
      order.value = next;
      runOnJS(emit)(next);
      runOnJS(tick)();
    }

    // Auto-scroll when the finger is near the top/bottom of the visible area.
    const fingerViewportY = containerY.value + dragTop.value + touchY.value - scrollY.value;
    const maxScroll = Math.max(0, contentH.value - viewportH.value);
    if (fingerViewportY < EDGE && scrollY.value > 0) {
      scrollTo(scrollRef, 0, Math.max(0, scrollY.value - SCROLL_STEP), false);
    } else if (fingerViewportY > viewportH.value - EDGE && scrollY.value < maxScroll) {
      scrollTo(scrollRef, 0, Math.min(maxScroll, scrollY.value + SCROLL_STEP), false);
    }
  });

  return (
    <Animated.ScrollView
      ref={scrollRef}
      scrollEnabled={!dragging}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={16}
      onLayout={(e: LayoutChangeEvent) => { viewportH.value = e.nativeEvent.layout.height; }}
      onContentSizeChange={(_w, h) => { contentH.value = h; }}
      contentContainerStyle={contentContainerStyle}
    >
      {header}
      <View
        style={{ height: contentHeight }}
        onLayout={(e: LayoutChangeEvent) => { containerY.value = e.nativeEvent.layout.y; }}
      >
        {(decorations ?? []).map((d) => (
          <View key={d.key} style={{ position: 'absolute', left: 0, right: 0, top: d.top, height: d.height }}>
            {d.node}
          </View>
        ))}
        {data.map((item, index) => (
          <Row
            key={item.id}
            item={item}
            index={index}
            rowHeight={rowHeight}
            order={order}
            slotTopsSV={slotTopsSV}
            activeId={activeId}
            dragTop={dragTop}
            startTop={startTop}
            startScroll={startScroll}
            touchY={touchY}
            transY={transY}
            scrollY={scrollY}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          >
            {renderRow(item, index)}
          </Row>
        ))}
      </View>
      {footer}
    </Animated.ScrollView>
  );
}
