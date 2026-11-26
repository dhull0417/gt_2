// Remembers where each form section sits in the ScrollView so a Save/Review tap with problems
// can scroll to the first one. Attach `register('when', 'timezone')` as onLayout on a direct
// child of the ScrollView's content (a section card), listing the areas it holds.
import { useCallback, useRef, type RefObject } from 'react';
import type { LayoutChangeEvent, ScrollView } from 'react-native';
import type { ScrollViewInstance } from 'react-native';
import type { FormArea } from '@/utils/formIssues';

export function useIssueScroll(scrollRef: RefObject<ScrollViewInstance | null>) {
  const ys = useRef<Partial<Record<FormArea, number>>>({});
  const register = useCallback((...areas: FormArea[]) => (e: LayoutChangeEvent) => {
    for (const a of areas) ys.current[a] = e.nativeEvent.layout.y;
  }, []);
  const scrollTo = useCallback((area: FormArea | null) => {
    const y = area ? ys.current[area] : undefined;
    if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - 16), animated: true });
  }, [scrollRef]);
  return { register, scrollTo };
}
