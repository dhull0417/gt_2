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

describe('applyReactionToggle', () => {
  const { applyReactionToggle } = require('../chatCache');
  const msg = (id: string, reactions?: Record<string, string[]>) =>
    ({ id, group_id: 'g', sender_id: 'author', sender_name: 'Al', content: '', created_at: '2026-01-01T00:00:00Z', reactions });

  it('adds my reaction', () => {
    const list = [msg('a'), msg('b', { '👍': ['x'] })];
    const { messages, result } = applyReactionToggle(list, 'b', '❤️', 'me');
    expect(messages[1].reactions).toEqual({ '👍': ['x'], '❤️': ['me'] });
    expect(result).toMatchObject({ action: 'added', emoji: '❤️', messageId: 'b', senderId: 'author', senderName: 'Al' });
    expect(messages[0]).toBe(list[0]); // untouched rows keep their identity (no re-render)
  });

  it('changes my reaction from one emoji to another', () => {
    const { messages, result } = applyReactionToggle([msg('b', { '👍': ['me', 'x'] })], 'b', '❤️', 'me');
    expect(messages[0].reactions).toEqual({ '👍': ['x'], '❤️': ['me'] });
    expect(result).toMatchObject({ action: 'changed', emoji: '❤️', previousEmoji: '👍' });
  });

  it('removes my reaction when I tap the same emoji, dropping empty emoji keys', () => {
    const { messages, result } = applyReactionToggle([msg('b', { '👍': ['me'] })], 'b', '👍', 'me');
    expect(messages[0].reactions).toEqual({});
    expect(result).toMatchObject({ action: 'removed', emoji: '👍' });
  });

  it('keeps reactions that arrived from others when undoing mine', () => {
    // Undo = apply the same toggle again on the current state, not restore an old snapshot.
    const after = applyReactionToggle([msg('b', {})], 'b', '😂', 'me').messages;
    const withOthers = [{ ...after[0], reactions: { ...after[0].reactions, '🔥': ['other'] } }];
    expect(applyReactionToggle(withOthers, 'b', '😂', 'me').messages[0].reactions).toEqual({ '🔥': ['other'] });
  });
});

describe('undoReactionToggle', () => {
  const { applyReactionToggle, undoReactionToggle } = require('../chatCache');
  const msg = (reactions: Record<string, string[]>) =>
    [{ id: 'b', group_id: 'g', sender_id: 'a', sender_name: 'A', content: '', created_at: '2026-01-01T00:00:00Z', reactions }];

  it('puts a changed reaction back to the previous emoji', () => {
    const { messages, result } = applyReactionToggle(msg({ '👍': ['me'] }), 'b', '❤️', 'me');
    expect(undoReactionToggle(messages, result, 'me')[0].reactions).toEqual({ '👍': ['me'] });
  });
  it('removes an added one and restores a removed one', () => {
    const added = applyReactionToggle(msg({}), 'b', '❤️', 'me');
    expect(undoReactionToggle(added.messages, added.result, 'me')[0].reactions).toEqual({});
    const removed = applyReactionToggle(msg({ '❤️': ['me'] }), 'b', '❤️', 'me');
    expect(undoReactionToggle(removed.messages, removed.result, 'me')[0].reactions).toEqual({ '❤️': ['me'] });
  });
});
