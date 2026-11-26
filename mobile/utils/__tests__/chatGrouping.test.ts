import { computeGrouping, GROUP_WINDOW_MS } from '../chatGrouping';
import type { ChatMessage } from '@/types/chat';

const base = Date.parse('2026-10-19T12:00:00Z');
const msg = (id: string, sender: string, offsetMs: number, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  group_id: 'g',
  sender_id: sender,
  sender_name: sender,
  content: id,
  created_at: new Date(base + offsetMs).toISOString(),
  ...extra,
});

describe('computeGrouping', () => {
  it('clusters consecutive messages from one sender inside the window', () => {
    const g = computeGrouping([msg('a', 'u1', 0), msg('b', 'u1', 60_000), msg('c', 'u1', 120_000)]);
    expect(g.get('a')).toEqual({ isFirst: true, isLast: false });
    expect(g.get('b')).toEqual({ isFirst: false, isLast: false });
    expect(g.get('c')).toEqual({ isFirst: false, isLast: true });
  });

  it('splits on a different sender', () => {
    const g = computeGrouping([msg('a', 'u1', 0), msg('b', 'u2', 1000), msg('c', 'u1', 2000)]);
    for (const id of ['a', 'b', 'c']) expect(g.get(id)).toEqual({ isFirst: true, isLast: true });
  });

  it('splits when the gap exceeds the window', () => {
    const g = computeGrouping([msg('a', 'u1', 0), msg('b', 'u1', GROUP_WINDOW_MS), msg('c', 'u1', GROUP_WINDOW_MS * 2 + 1)]);
    expect(g.get('a')).toEqual({ isFirst: true, isLast: false });
    expect(g.get('b')).toEqual({ isFirst: false, isLast: true });
    expect(g.get('c')).toEqual({ isFirst: true, isLast: true });
  });

  it('never clusters system lines', () => {
    const g = computeGrouping([
      msg('a', 'u1', 0),
      msg('s', 'system', 1000, { kind: 'system' }),
      msg('b', 'u1', 2000),
    ]);
    expect(g.get('a')).toEqual({ isFirst: true, isLast: true });
    expect(g.get('s')).toEqual({ isFirst: true, isLast: true });
    expect(g.get('b')).toEqual({ isFirst: true, isLast: true });
  });

  it('handles empty and single', () => {
    expect(computeGrouping([]).size).toBe(0);
    expect(computeGrouping([msg('a', 'u1', 0)]).get('a')).toEqual({ isFirst: true, isLast: true });
  });
});
