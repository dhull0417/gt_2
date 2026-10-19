import { mergeLatestPage, mergeOlderPage, upsertMessage } from '../chatCache';
import type { ChatMessage } from '@/types/chat';

const t = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString();
const msg = (id: string, sec: number, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  group_id: 'g',
  sender_id: 'u',
  sender_name: 'U',
  content: id,
  created_at: t(sec),
  ...extra,
});
const ids = (list: ChatMessage[]) => list.map((m) => m.id);

describe('upsertMessage', () => {
  it('appends a newer message at the end', () => {
    expect(ids(upsertMessage([msg('a', 1), msg('b', 2)], msg('c', 3)))).toEqual(['a', 'b', 'c']);
  });

  it('places an out-of-order message by time', () => {
    expect(ids(upsertMessage([msg('a', 1), msg('c', 3)], msg('b', 2)))).toEqual(['a', 'b', 'c']);
  });

  it('updates an existing id instead of duplicating it', () => {
    const out = upsertMessage([msg('a', 1, { content: 'old' })], msg('a', 1, { content: 'new', client_id: 'x' }));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'a', content: 'new', client_id: 'x' });
  });
});

describe('mergeLatestPage', () => {
  it('uses the page when nothing is cached', () => {
    const page = [msg('a', 1)];
    expect(mergeLatestPage(undefined, page, 50)).toBe(page);
  });

  it('keeps a newer realtime message the fetched snapshot does not have yet', () => {
    const cached = [msg('a', 1), msg('b', 2), msg('new', 9)];
    const page = [msg('a', 1), msg('b', 2)];
    expect(ids(mergeLatestPage(cached, page, 50))).toEqual(['a', 'b', 'new']);
  });

  it('lets server fields win for messages in both (missed edits/reactions)', () => {
    const cached = [msg('a', 1, { reactions: {} })];
    const page = [msg('a', 1, { reactions: { '👍': ['u2'] } })];
    expect(mergeLatestPage(cached, page, 50)[0].reactions).toEqual({ '👍': ['u2'] });
  });

  it('drops stale cached rows when a full page has no overlap, but keeps rows newer than the page', () => {
    const cached = [msg('old1', 1), msg('old2', 2), msg('live', 20)];
    const page = [msg('p1', 10), msg('p2', 11)];
    expect(ids(mergeLatestPage(cached, page, 2))).toEqual(['p1', 'p2', 'live']);
  });

  it('keeps the cache when a short page has no overlap (small thread, nothing missing)', () => {
    const cached = [msg('a', 1)];
    const page = [msg('b', 2)];
    expect(ids(mergeLatestPage(cached, page, 50))).toEqual(['a', 'b']);
  });
});

describe('mergeOlderPage', () => {
  it('prepends older rows in time order', () => {
    expect(ids(mergeOlderPage([msg('c', 30), msg('d', 40)], [msg('a', 10), msg('b', 20)]))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('does not duplicate overlap and keeps the fresher cached copy', () => {
    const cached = [msg('b', 20, { reactions: { '👍': ['u2'] } }), msg('c', 30)];
    const out = mergeOlderPage(cached, [msg('a', 10), msg('b', 20)]);
    expect(ids(out)).toEqual(['a', 'b', 'c']);
    expect(out[1].reactions).toEqual({ '👍': ['u2'] });
  });

  it('handles an empty cache or empty page', () => {
    expect(ids(mergeOlderPage(undefined, [msg('a', 1)]))).toEqual(['a']);
    expect(ids(mergeOlderPage([msg('a', 1)], []))).toEqual(['a']);
  });
});
